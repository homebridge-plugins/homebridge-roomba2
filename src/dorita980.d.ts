declare module "dorita980" {
    export interface Roomba {
        connected: boolean

        on(event: "state", callback: (state: RobotState) => void): void
        on(event: "connect", callback: () => void): void
        clean(): void
        pause(): void
        end(): void
        dock(): Promise<void>
        getRobotState(states: string[]): Promise<RobotState>
    }

    export interface RobotState {
        batPct?: number
        bin?: {
            full: boolean
        }
        cleanMissionStatus?: {
            phase: "run" | "charge" | "stop"
        }
    }

    export class Local implements Roomba {
        public connected: boolean

        public constructor(blid: string, robotpwd: string, ipaddress: string)
		
        public on(event: "state", callback: (state: RobotState) => void): void;
        public on(event: "connect", callback: () => void): void;
        public clean(): void
        public pause(): void
        public end(): void
        public dock(): Promise<void>
        public getRobotState(states: string[]): Promise<RobotState>
    }
}
