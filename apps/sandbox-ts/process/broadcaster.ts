export class Broadcaster<T>{
    private subscribers = new Set<(data:T) => void>()
    private closed = false;
    private onCloseHandlers = new Set<() => void>()

    subscribe(fn: (data: T) => void): () => void {
        if(this.closed){
            throw new Error("Broadcaster closed");
        }

        this.subscribers.add(fn)

        return () => {
            this.subscribers.delete(fn)
        }
    }

    publish(data: T){
        if(this.closed) return;

        for(const fn of this.subscribers){
            try {
                fn(data)
            } catch (error) {
                
            }
        }
    }

    onClose(fn: () => void):() => void{
        if(this.closed){
            fn()
            return () => {}
        }
        this.onCloseHandlers.add(fn)
        return () => this.onCloseHandlers.delete(fn)
    }

    close(){
        if(this.closed) return;
        this.closed = true;
        
        for(const fn of this.onCloseHandlers) fn();
        this.subscribers.clear();
        this.onCloseHandlers.clear()
    }
}