---
"homebridge-roomba2": minor
---

Actively watch Roomba's status and update HomeKit for a short period of time after being inspected

HomeKit inspects Roomba when you open the Home app, but it doesn't continously poll for changes
so the plugin now watches Roomba for changes and pushes them to the Home app.
