declare module "dorita980" {
    export interface Roomba {
        connected: boolean

        on(event: "state", callback: (state: RobotState) => void): void
        on(event: "connect", callback: () => void): void
        clean(): Promise<CommandResult>
        pause(): Promise<CommandResult>
        end(): Promise<CommandResult>
        dock(): Promise<CommandResult>
        getRobotState(states: string[]): Promise<RobotState>
    }

    export interface CommandStatus {
        ok: string | null | boolean
    }
    
    export interface RobotState {
        batPct?: number
        bin?: {
            full: boolean
        }
        cleanMissionStatus?: {
            phase: "run" | "charge" | "stop" | "hmUsrDock"
        }
    }

    export class Local implements Roomba {
        public connected: boolean

        public constructor(blid: string, robotpwd: string, ipaddress: string)
		
        public on(event: "state", callback: (state: RobotState) => void): void;
        public on(event: "connect", callback: () => void): void;
        public clean(): Promise<CommandResult>
        public pause(): Promise<CommandResult>
        public end(): Promise<CommandResult>
        public dock(): Promise<CommandResult>
        public getRobotState(states: string[]): Promise<RobotState>
    }
}
