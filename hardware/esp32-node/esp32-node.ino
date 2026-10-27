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
 * HTTP endpoints:
 *   GET /         small HTML page
 *   GET /status   JSON telemetry (used by the gateway/UI)
 *   GET /ping     "pong" (latency / lightweight traffic target)
 *   GET /load?n=  N bytes of payload (traffic generation target)
 *
 * Wiring (all I2C sensors share the bus):
 *   SDA -> GPIO21 (D21)      SCL -> GPIO22 (D22)      GND -> GND
 *   BME280-5V : VCC -> 5V    INA219 : VCC -> 3V3      BH1750 : VCC -> 3V3
 *
 * Libraries (Arduino Library Manager):
 *   Adafruit BME280 Library, Adafruit Unified Sensor, Adafruit INA219,
 *   BH1750 (by Christopher Laws).
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>

// ---- configuration — EDIT THESE -----------------------------------------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* NODE_NAME = "esp32-node-01";   // also the mDNS name: esp32-node-01.local
const int   HTTP_PORT = 80;
const int   SDA_PIN   = 21;
const int   SCL_PIN   = 22;

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
    Serial.printf("[ina219] %s\n", hasINA ? "ready" : "begin FAIL");
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

String telemetryJson() {
  float t = NAN, h = NAN, p = NAN, lux = NAN, volt = NAN, cur = NAN, pw = NAN;
  if (hasBME) { t = bme.readTemperature(); h = bme.readHumidity(); p = bme.readPressure() / 100.0f; }
  if (hasBH)  { lux = lightMeter.readLightLevel(); }
  if (hasINA) {
    volt = ina219.getBusVoltage_V() + ina219.getShuntVoltage_mV() / 1000.0f;
    cur  = ina219.getCurrent_mA();
    pw   = ina219.getPower_mW();
  }
  float txdbm = (float)WiFi.getTxPower() / 4.0f;   // enum value is in 0.25 dBm steps

  String j = "{";
  j += "\"node\":\"" + String(NODE_NAME) + "\",";
  j += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  j += "\"uptime_s\":" + String(millis() / 1000) + ",";
  j += "\"rssi_dbm\":" + String(WiFi.RSSI()) + ",";
  j += "\"tx_power_dbm\":" + String(txdbm, 2) + ",";
  j += "\"free_heap\":" + String(ESP.getFreeHeap()) + ",";
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
  j += "\"power_mw\":"      + jnum(pw, 2);
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

void handleRoot() {
  String html = "<!doctype html><meta charset=utf-8><h3>" + String(NODE_NAME) + "</h3>";
  html += "<p>IP: " + WiFi.localIP().toString() + " | RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
  html += "<p><a href='/status'>/status</a> (JSON telemetry) &middot; <a href='/ping'>/ping</a></p>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[boot] ESP32 test node starting");

  Wire.begin(SDA_PIN, SCL_PIN);
  scanSensors();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                     // keep latency low and traffic steady
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
  server.begin();
  Serial.printf("[http] server on port %d  ->  http://%s/status\n",
                HTTP_PORT, WiFi.localIP().toString().c_str());
}

void loop() {
  server.handleClient();
}
