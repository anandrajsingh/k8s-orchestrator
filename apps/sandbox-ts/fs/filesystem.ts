import path from "path"
import * as fs from "fs/promises"
import type { Stats } from "fs"

export class FileSystem {
    private root: string

    constructor(root: string) {
        this.root = root
    }

    private resolve(userPath: string): string {
        if (path.isAbsolute(userPath)) {
            throw new Error("Absolute path is not allowed.")
        }

        const resolved = path.resolve(this.root, userPath)

        const rootWithSep = this.root.endsWith(path.sep)
            ? this.root
            : this.root + path.sep

        if (!resolved.startsWith(rootWithSep)) {
            throw new Error("path escapes process root")
        }
        return resolved
    }

    async readFile(p: string): Promise<Buffer> {
        const full = this.resolve(p)
        return fs.readFile(full)
    }

    async writeFile(p: string, data: Buffer | string): Promise<void> {
        const full = this.resolve(p)
        await fs.mkdir(path.dirname(full), { recursive: true })
        await fs.writeFile(full, data)
    }

    async listDir(p: string): Promise<string[]> {
        const full = this.resolve(p)
        return fs.readdir(full)
    }

    async stat(p: string): Promise<Stats> {
        const full = this.resolve(p)
        return fs.stat(full)
    }
}