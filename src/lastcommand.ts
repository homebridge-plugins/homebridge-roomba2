/* eslint-disable no-console */
import process from 'node:process'

import dorita980 from 'dorita980'

if (!process.argv[4]) {
  console.log('Usage: npm run getlastcommand <robot_blid> <robot_pwd> <robot_ip_address>')
  process.exit()
}

const robot_blid = process.argv[2]
const robot_pwd = process.argv[3]
const robot_ip_address = process.argv[4]

const myRobotViaLocal = new dorita980.Local(robot_blid, robot_pwd, robot_ip_address)

myRobotViaLocal.on('connect', init)

type RobotState = dorita980.RobotState & { lastCommand?: { regions: { regionId: number, regionType: string }[] } }

function init() {
  myRobotViaLocal.getRobotState(['lastCommand'])
    .then((result: RobotState) => {
      console.log('lastCommand:', result.lastCommand, ', regionsDetails:', result.lastCommand?.regions)
      myRobotViaLocal.end()
    })
    .catch(console.log)
}
