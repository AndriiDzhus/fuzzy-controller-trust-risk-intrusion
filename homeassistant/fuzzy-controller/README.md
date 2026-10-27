# Fuzzy Controller — Home Assistant add-on

Deploys the fuzzy-controller web app (trust index, security risk, intrusion
probability + joint assessment / real-device mode) on a Home Assistant OS
gateway (e.g. Raspberry Pi). The add-on is a thin wrapper: at start-up it
clones this repository from GitHub and runs `node server.js`.

## Install (Home Assistant OS)

1. Copy the folder `homeassistant/fuzzy-controller/` into the add-ons share of
   your Home Assistant, so it becomes `/addons/fuzzy-controller/`
   (use the **Samba share** or **Studio Code Server** add-on).
2. In Home Assistant: **Settings → Add-ons → Add-on store → ⋮ → Check for
   updates**. The add-on appears under **Local add-ons** as
   *Fuzzy Controller — Security Assessment*.
3. Open it and press **Install**, then **Start**.
4. Open the UI:
   - as a page in the Home Assistant sidebar (**Fuzzy Security**, via ingress), or
   - directly at `http://<home-assistant-ip>:3002`.

## Updating

The app is pulled from GitHub at start-up. To update: push to the branch set in
the add-on **Configuration** (`ref`, default `main`) and **Restart** the add-on.
`repo` / `ref` can be changed in the add-on Configuration tab.

## Notes

- The repository must be reachable over HTTPS from the gateway (public repo, or
  a URL with an access token).
- The app runs in "server" mode: the three controller pages and the joint
  assessment page use the REST API of the same server.
- Real-device endpoints (`/api/devices/...`) are the next step (gateway backend
  + ESP32); until then the joint assessment page offers the local demo device.
