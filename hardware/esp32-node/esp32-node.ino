/*
 * ESP32 IoT test node — fuzzy-controller security test bench (Variant A).
 *
 * The node is an OBSERVED device on an isolated test bench: it is a reachable
 * HTTP endpoint, so the gateway (Raspberry Pi) sees real traffic to/from it
 * and computes the flow features there. The node also reports its own
 * telemetry — Wi-Fi TX power, RSSI, uptime — and sensor readings.
 *
 * Sensors are auto-detected on the I2C bus at start-up:
 *   - BME280  (0x76/0x77) : temperature, humidity, pressure   [present now]
 *   - INA219  (0x40)      : bus voltage, current, power (EC)   [add later]
 *   - BH1750  (0x23/0x5C) : illuminance (lux)                  [add later]
 * Missing sensors are simply reported as absent; add them and reboot.
 *
 * Firmware version (FW_VERSION, reported in /status as "fw_version"):
 *   1.0.0  sensors, /status /ping /load
 *   1.1.0  sensor cache (I2C read in loop(), not in HTTP handlers),
 *          WS2812B status indicator (/led), watchdog
 *   1.2.0  indicator state "standby" (dim blue), fw_version in /status
 *   1.2.1  joins the access point with the strongest signal (mesh Wi-Fi:
 *          by default the ESP32 takes the first one it finds); "bssid" and
 *          "channel" in /status
 *   1.3.0  INA219: sampled every 100 ms and averaged over the sensor period
 *          (the node's current has short Wi-Fi TX spikes, one sample per 2 s
 *          would be noise); "power_mw" is the mean, "power_mw_max" the peak,
 *          "ina_samples" the number of samples; calibration 32 V / 1 A
 *
 * HTTP endpoints:
 *   GET /             small HTML page
 *   GET /status       JSON telemetry (used by the gateway/UI)
 *   GET /ping         "pong" (latency / lightweight traffic target)
 *   GET /load?n=      N bytes of payload (traffic generation target)
 *   GET /led?state=   status indicator: normal | warning | critical | standby | off
 *
 * Status indicator (one WS2812B pixel cut from an addressable strip):
 *   the gateway sets the colour from the computed security level
 *   (green = normal, yellow = warning, red = critical); dim blue = standby
 *   (connected, indication on, no assessment yet). The node cannot
 *   detect the pixel, so its presence is a build-time flag (HAS_INDICATOR).
 *   If no command arrives for LED_WATCHDOG_MS the pixel is switched off
 *   (the page refreshes the state every 20 s while indication is on).
 *
 * Wiring (all I2C sensors share the bus):
 *   SDA -> GPIO21 (D21)      SCL -> GPIO22 (D22)      GND -> GND
 *   BME280-5V : VCC -> 5V    INA219 : VCC -> 3V3      BH1750 : VCC -> 3V3 (ADDR open -> 0x23)
 *   INA219 measures the node's own supply: 5 V source (+) -> VIN+, VIN- -> ESP32 VIN (5V pin),
 *   source GND -> ESP32 GND; the ESP32 USB port must be unplugged while measuring.
 *   WS2812B   : +5V -> VIN (5V)   GND -> GND   DIn -> GPIO27 via 330 ohm
 *
 * Libraries (Arduino Library Manager):
 *   Adafruit BME280 Library, Adafruit Unified Sensor, Adafruit INA219,
 *   BH1750 (by Christopher Laws), Adafruit NeoPixel.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>
#include <Adafruit_NeoPixel.h>

const char* FW_VERSION = "1.3.0";          // bump on every firmware change (see the list above)

// ---- configuration — EDIT THESE -----------------------------------------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* NODE_NAME = "esp32-node-01";   // also the mDNS name: esp32-node-01.local
const int   HTTP_PORT = 80;
const int   SDA_PIN   = 21;
const int   SCL_PIN   = 22;

// ---- status indicator (WS2812B pixel) -------------------------------------
#define HAS_INDICATOR 1                   // 0 if no pixel is soldered to the board
const int      LED_PIN         = 27;      // DIn of the pixel (through 330 ohm)
const uint8_t  LED_BRIGHTNESS  = 80;      // 0..255; keep low for photos
const uint32_t LED_WATCHDOG_MS = 60000;   // switch off if the gateway goes silent (the page refreshes every 20 s)

// ---- sensor cache ----------------------------------------------------------
// The sensors are read in loop() at most every SENSOR_PERIOD_MS and /status
// serves the cached values, so an I2C hiccup (a slow or failing read can block
// Wire for up to its timeout) never delays an HTTP response: /status is also
// the request target of the gateway in the normal-traffic scenario, and its
// response time must reflect the network, not the I2C bus.
const uint32_t SENSOR_PERIOD_MS = 2000;
const uint16_t I2C_TIMEOUT_MS   = 50;
float cT = NAN, cH = NAN, cP = NAN, cLux = NAN, cVolt = NAN, cCur = NAN, cPw = NAN, cPwMax = NAN;
uint16_t cInaN = 0;
uint32_t sensorsReadAt = 0;
// INA219 is sampled continuously between sensor reads (see sampleIna()).
const uint32_t INA_SAMPLE_MS = 100;
float    inaSumV = 0, inaSumI = 0, inaSumP = 0, inaMaxP = 0;
uint16_t inaN = 0;
uint32_t inaSampledAt = 0;

// ---- I2C addresses -------------------------------------------------------
#define ADDR_BME_A 0x76
#define ADDR_BME_B 0x77
#define ADDR_INA   0x40
#define ADDR_BH_A  0x23
#define ADDR_BH_B  0x5C

WebServer server(HTTP_PORT);
Adafruit_BME280 bme;
Adafruit_INA219 ina219;
BH1750 lightMeter;

bool hasBME = false, hasINA = false, hasBH = false;
uint8_t bmeAddr = 0, bhAddr = 0;

Adafruit_NeoPixel pixel(1, LED_PIN, NEO_GRB + NEO_KHZ800);
String   ledState   = "off";              // normal | warning | critical | standby | off
uint32_t ledLastCmd = 0;                  // millis() of the last /led command

// ---- indicator -------------------------------------------------------------
// Sets the pixel colour for a security state. Returns false for an unknown state.
bool setIndicator(const String& state) {
#if HAS_INDICATOR
  uint32_t c;
  if      (state == "normal")   c = pixel.Color(0, 60, 0);    // green
  else if (state == "warning")  c = pixel.Color(70, 45, 0);   // yellow (R+G)
  else if (state == "critical") c = pixel.Color(80, 0, 0);    // red
  else if (state == "standby")  c = pixel.Color(0, 0, 45);    // dim blue: connected, no assessment yet
  else if (state == "off")      c = pixel.Color(0, 0, 0);
  else return false;
  pixel.setPixelColor(0, c);
  pixel.show();
#else
  if (state != "normal" && state != "warning" && state != "critical" && state != "standby" && state != "off") return false;
#endif
  ledState = state;
  return true;
}

void indicatorSelfTest() {
#if HAS_INDICATOR
  pixel.begin();
  pixel.setBrightness(LED_BRIGHTNESS);
  const char* seq[] = { "critical", "warning", "normal" };
  for (auto s : seq) { setIndicator(s); delay(300); }
  setIndicator("off");
  Serial.printf("[led] WS2812B on GPIO%d ready (self-test done)\n", LED_PIN);
#else
  Serial.println("[led] no indicator (HAS_INDICATOR=0)");
#endif
}

// ---- helpers -------------------------------------------------------------
bool i2cPresent(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

uint8_t bmeChipId(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(0xD0);                 // chip-id register
  Wire.endTransmission();
  Wire.requestFrom(addr, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0;
}

void scanSensors() {
  Serial.println("[i2c] scanning bus...");
  for (uint8_t a = 1; a < 127; a++)
    if (i2cPresent(a)) Serial.printf("[i2c]   found device at 0x%02X\n", a);

  // BME280 / BMP280
  if (i2cPresent(ADDR_BME_A)) bmeAddr = ADDR_BME_A;
  else if (i2cPresent(ADDR_BME_B)) bmeAddr = ADDR_BME_B;
  if (bmeAddr) {
    uint8_t id = bmeChipId(bmeAddr);
    hasBME = bme.begin(bmeAddr);
    const char* kind = (id == 0x60) ? "BME280 (temp+hum+press)"
                     : (id == 0x58 || id == 0x56 || id == 0x57) ? "BMP280 (NO humidity!)"
                     : "unknown";
    Serial.printf("[bme] addr 0x%02X chipID 0x%02X -> %s | begin=%s\n",
                  bmeAddr, id, kind, hasBME ? "ok" : "FAIL");
  } else Serial.println("[bme] not found");

  // INA219 (energy) — add later
  if (i2cPresent(ADDR_INA)) {
    hasINA = ina219.begin();
    if (hasINA) ina219.setCalibration_32V_1A();   // 0.4 mA resolution; ESP32 peaks stay below 1 A
    Serial.printf("[ina219] %s\n", hasINA ? "ready (32 V / 1 A)" : "begin FAIL");
  } else Serial.println("[ina219] not found (add later)");

  // BH1750 (lux) — add later
  if (i2cPresent(ADDR_BH_A)) bhAddr = ADDR_BH_A;
  else if (i2cPresent(ADDR_BH_B)) bhAddr = ADDR_BH_B;
  if (bhAddr) {
    hasBH = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, bhAddr);
    Serial.printf("[bh1750] %s (0x%02X)\n", hasBH ? "ready" : "begin FAIL", bhAddr);
  } else Serial.println("[bh1750] not found (add later)");
}

String jnum(float v, int d) { return isnan(v) ? String("null") : String(v, d); }

// One INA219 sample (called from loop() every INA_SAMPLE_MS): accumulated
// until the next readSensors(), which turns the sum into the mean of the period.
void sampleIna() {
  float v = ina219.getBusVoltage_V() + ina219.getShuntVoltage_mV() / 1000.0f;
  float i = ina219.getCurrent_mA();
  float p = v * i;                          // mW (V * mA)
  inaSumV += v; inaSumI += i; inaSumP += p;
  if (inaN == 0 || p > inaMaxP) inaMaxP = p;
  inaN += 1;
  inaSampledAt = millis();
}

// Reads all present sensors into the cache (called from loop(), not from HTTP handlers).
void readSensors() {
  if (hasBME) { cT = bme.readTemperature(); cH = bme.readHumidity(); cP = bme.readPressure() / 100.0f; }
  if (hasBH)  { cLux = lightMeter.readLightLevel(); }
  if (hasINA) {
    if (inaN == 0) sampleIna();             // first call after boot
    cVolt = inaSumV / inaN; cCur = inaSumI / inaN; cPw = inaSumP / inaN; cPwMax = inaMaxP; cInaN = inaN;
    inaSumV = inaSumI = inaSumP = inaMaxP = 0; inaN = 0;
  }
  sensorsReadAt = millis();
}

String telemetryJson() {
  float t = cT, h = cH, p = cP, lux = cLux, volt = cVolt, cur = cCur, pw = cPw;
  float txdbm = (float)WiFi.getTxPower() / 4.0f;   // enum value is in 0.25 dBm steps

  String j = "{";
  j += "\"node\":\"" + String(NODE_NAME) + "\",";
  j += "\"fw_version\":\"" + String(FW_VERSION) + "\",";
  j += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  j += "\"uptime_s\":" + String(millis() / 1000) + ",";
  j += "\"rssi_dbm\":" + String(WiFi.RSSI()) + ",";
  j += "\"bssid\":\"" + WiFi.BSSIDstr() + "\",";        // which access point (mesh node)
  j += "\"channel\":" + String(WiFi.channel()) + ",";
  j += "\"tx_power_dbm\":" + String(txdbm, 2) + ",";
  j += "\"free_heap\":" + String(ESP.getFreeHeap()) + ",";
  j += "\"sensors_age_s\":" + String(sensorsReadAt ? (millis() - sensorsReadAt) / 1000 : 0) + ",";
  j += "\"sensors\":{";
  j +=   "\"bme280\":" + String(hasBME ? "true" : "false") + ",";
  j +=   "\"ina219\":" + String(hasINA ? "true" : "false") + ",";
  j +=   "\"bh1750\":" + String(hasBH ? "true" : "false");
  j += "},";
  j += "\"temperature_c\":" + jnum(t, 2) + ",";
  j += "\"humidity_pct\":"  + jnum(h, 2) + ",";
  j += "\"pressure_hpa\":"  + jnum(p, 2) + ",";
  j += "\"lux\":"           + jnum(lux, 1) + ",";
  j += "\"bus_voltage_v\":" + jnum(volt, 3) + ",";
  j += "\"current_ma\":"    + jnum(cur, 2) + ",";
  j += "\"power_mw\":"      + jnum(pw, 2) + ",";          // mean over the sensor period
  j += "\"power_mw_max\":"  + jnum(cPwMax, 2) + ",";      // peak sample of the period
  j += "\"ina_samples\":"   + String(cInaN) + ",";
  j += "\"indicator\":{";
  j +=   "\"present\":" + String(HAS_INDICATOR ? "true" : "false") + ",";
  j +=   "\"state\":\"" + ledState + "\",";
  j +=   "\"age_s\":" + String(ledLastCmd ? (millis() - ledLastCmd) / 1000 : 0);
  j += "}";
  j += "}";
  return j;
}

// ---- HTTP handlers -------------------------------------------------------
void handleStatus() { server.send(200, "application/json", telemetryJson()); }
void handlePing()   { server.send(200, "text/plain", "pong"); }

void handleLoad() {
  int n = server.hasArg("n") ? server.arg("n").toInt() : 1024;
  n = constrain(n, 0, 65536);
  String body; body.reserve(n);
  for (int i = 0; i < n; i++) body += char('A' + (i % 26));
  server.send(200, "application/octet-stream", body);
}

// GET /led?state=normal|warning|critical|standby|off  -> {"led":"<state>"}
void handleLed() {
  String s = server.hasArg("state") ? server.arg("state") : "";
  if (!setIndicator(s)) { server.send(400, "application/json", "{\"error\":\"bad state\"}"); return; }
  ledLastCmd = millis();
  server.send(200, "application/json", "{\"led\":\"" + s + "\"}");
}

void handleRoot() {
  String html = "<!doctype html><meta charset=utf-8><h3>" + String(NODE_NAME) + "</h3>";
  html += "<p>Firmware " + String(FW_VERSION) + " | IP: " + WiFi.localIP().toString() + " | RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
  html += "<p><a href='/status'>/status</a> (JSON telemetry) &middot; <a href='/ping'>/ping</a> &middot; <a href='/led?state=normal'>/led?state=normal</a></p>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n[boot] ESP32 test node starting, firmware %s\n", FW_VERSION);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setTimeOut(I2C_TIMEOUT_MS);          // a stuck bus must not block the node for a second
  scanSensors();
  readSensors();
  indicatorSelfTest();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                     // keep latency low and traffic steady
  // Mesh Wi-Fi: scan all channels and join the strongest access point, not the
  // first one found (the default fast scan may pick a far mesh node).
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[wifi] connecting");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) { delay(400); Serial.print("."); }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected  IP=%s  RSSI=%d dBm  TX=%.2f dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI(), (float)WiFi.getTxPower() / 4.0f);
    if (MDNS.begin(NODE_NAME))
      Serial.printf("[mdns] http://%s.local/status\n", NODE_NAME);
  } else {
    Serial.println("[wifi] FAILED to connect — check WIFI_SSID / WIFI_PASS");
  }

  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/ping", handlePing);
  server.on("/load", handleLoad);
  server.on("/led", handleLed);
  server.begin();
  Serial.printf("[http] server on port %d  ->  http://%s/status\n",
                HTTP_PORT, WiFi.localIP().toString().c_str());
}

void loop() {
  server.handleClient();
  if (hasINA && millis() - inaSampledAt >= INA_SAMPLE_MS) sampleIna();
  if (millis() - sensorsReadAt >= SENSOR_PERIOD_MS) readSensors();
  // watchdog: the indicator shows the gateway's decision, so it must not
  // keep the last colour forever once the gateway stops talking to the node
  if (ledLastCmd && ledState != "off" && millis() - ledLastCmd > LED_WATCHDOG_MS) {
    setIndicator("off");
    ledLastCmd = 0;
    Serial.println("[led] watchdog: no command for 60 s -> off");
  }
}
