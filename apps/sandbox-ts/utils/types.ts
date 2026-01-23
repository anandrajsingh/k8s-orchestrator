export interface ExecRequest{
    command: string,
    args: string[],
    env: Record<string,string>,
    cwd?: string,
    timeoutMs?: number
}

export interface ExecResponse {
    stdout: string,
    stderr: string,
    exitCode : number,
    error? : string
}