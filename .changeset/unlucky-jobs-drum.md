---
"homebridge-roomba2": patch
---

Refresh Roomba's status after every action so we update our version of Roomba's state ASAP.

The previous approach of updating the state directly had a race condition with pre-existing updates of Roomba's state.
