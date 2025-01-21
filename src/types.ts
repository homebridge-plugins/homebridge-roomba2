import type { RobotMission } from 'dorita980'

export interface DeviceConfig {
  name: string
  model: string
  serialnum?: string
  blid: string
  robotpwd: string
  ipaddress: string
  cleanBehaviour: 'everywhere' | 'rooms'
  mission?: RobotMission
  stopBehaviour: 'home' | 'pause'
  /**
   * Idle Poll Interval (minutes).
   * How often to poll Roomba's status when it is idle.
   */
  idleWatchInterval: number

  dockContactSensor?: boolean
  runningContactSensor?: boolean
  binContactSensor?: boolean
  dockingContactSensor?: boolean
  homeSwitch?: boolean
  tankContactSensor?: boolean
}
