declare module "dorita980" {
    export interface Roomba {
        connected: boolean

        on(event: "state", callback: (state: RobotState) => void): void
        on(event: "error", callback: (error: Error) => void): void
        on(event: string, callback: () => void): void
        off(event: string, callback: unknown): void
        clean(): Promise<CommandResult>
	cleanRoom(mission: any): Promise<CommandResult>
        resume(): Promise<CommandResult>
        pause(): Promise<CommandResult>
        stop(): Promise<CommandResult>
        end(): Promise<CommandResult>
        dock(): Promise<CommandResult>
        find(): Promise<CommandResult>
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
            phase: string
        }
    }

    export class Local implements Roomba {
        public connected: boolean;

        public constructor(blid: string, robotpwd: string, ipaddress: string)
		
        public on(event: "state", callback: (state: RobotState) => void): void;
        public on(event: "error", callback: (error: Error) => void): void;
        public on(event: string, callback: () => void): void;
        public off(event: string, callback: unknown): void;
        public clean(): Promise<CommandResult>
	public cleanRoom(mission: any): Promise<CommandResult>
        public resume(): Promise<CommandResult>
        public pause(): Promise<CommandResult>
        public stop(): Promise<CommandResult>
        public end(): Promise<CommandResult>
        public dock(): Promise<CommandResult>
        public find(): Promise<CommandResult>
        public getRobotState(states: string[]): Promise<RobotState>
    }
}
