# Changelog

## 1.3.0-beta.7

### Minor Changes

- 2863a49: Rename noDockOnStop to dockOnStop [#73 #74] (thanks @rcoletti116, @khad)

## 1.3.0-beta.6

### Minor Changes

- e32d078: Add a long-term slow watching of Roomba's status so we always have a status

## 1.3.0-beta.5

### Patch Changes

- 73b02d3: Add a timeout when waiting for the full status from Roomba so we release our connection to Roomba
- c8ce152: Only update characteristics with changes

## 1.3.0-beta.4

### Patch Changes

- b3a25b0: Debug logging improvements and re-including the raw status in debug logs

## 1.3.0-beta.3

### Minor Changes

- 853b39e: Overhauled Roomba connections and status again, status gathering is now more passive

### Patch Changes

- 5399dbb: Fix delay when trying to dock

## 1.3.0-beta.2

### Minor Changes

- 721c3a6: Add a setting to control whether Roomba is sent home when stopped [#63] (thanks @rcoletti116)
- 44c026c: Stop behaviour now checks what state Roomba is in and no longer triggers a docking if Roomba is already docked

### Patch Changes

- b9daed9: Recognise more Roomba phases, including more docking phases and stuck

## 1.3.0-beta.1

### Patch Changes

- 58cba16: Improve Roomba connection handling

## 1.3.0-beta.0

### Minor Changes

- ae578c0: Refactor Roomba connection handling to improve reporting of issues connecting to Roomba and to reuse
  existing Roomba connections to avoid conflicts [#66]
- 3e9e48b: Include a resume command when starting cleaning so we can cope with a paused Roomba
- 44c6f8a: Actively watch Roomba's status and update HomeKit for a short period of time after being inspected

  HomeKit inspects Roomba when you open the Home app, but it doesn't continously poll for changes
  so the plugin now watches Roomba for changes and pushes them to the Home app.

- b7322c0: Add docking contact sensor
- 28eeeec: Report current plugin version as the firmware version
- aac6159: Change state refresh approach to be on demand rather than constant polling
  or keeping a permanent connection.
- 6dbb668: Convert to using TypeScript and pnpm for development

### Patch Changes

- Enable serial number to be specified in the configuration
- Change the manufacturer reported to HomeKit to iRobot
- f71c085: Add source code linting
- 032098a: Improve the log message when Roomba fails to complete a docking manoeuvre
- e623a28: Rename Docked contact sensor to Dock
- 1f02665: Improve the default name of the Bin Full sensor
- e79b7a3: Update dependencies
- 1346008: Logging more efficient and added a switch to enable easier debug logging

## 1.2.2

### Patch Changes

- 50a3640: Updated sample-config.json with accurate plugins section [#47]
- 450333e: Change the logging of each status request to debug level to reduce log noise [#50]
- 20d74fc: Fix double calling of the callback when using an expired status [#49]

## 1.2.1 (2021-02-01)

- Fix filterMaintenance service not being published properly, thanks @m-ruhl [#24]

## 1.2.0 (2020-05-12)

- Fixes #10 (Thank you @dvcrn) [PR: #16]

## 1.1.0 (2020-10-29)

- Added support for bin full notifications.

## 1.0.0 (2020-10-28)

- Plugin verified

## 0.0.2 (2020-10-28)

- Fixed (#1)

- Fied a typo in config.schema.json line 34, thanks @benasher44

## 0.0.1 (2020-10-20)

- Base plugin

- Added Contact sensor for running/docked notifications in home app, thanks @ncovercash
