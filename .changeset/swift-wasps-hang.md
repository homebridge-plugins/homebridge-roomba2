---
"homebridge-roomba2": patch
---

Decrease the frequency of Roomba status queries when Roomba is idle [#112]

Based on work by @Write. Also tidied up the handling of async in the connect method
and re-wrote the status watching approach.
