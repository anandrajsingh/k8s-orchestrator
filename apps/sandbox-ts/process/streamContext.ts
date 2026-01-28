export class StreamContext{
    private closed = false;
    private onCloseHandlers: Array<() => void> = []

    close(){
        if (this.closed) return;
        this.closed = true;
        for (const fn of this.onCloseHandlers) fn();
    }

    onclose(fn:() => void){
        if (this.closed){
            fn()
        }else{
            this.onCloseHandlers.push(fn)
        }
    }
}