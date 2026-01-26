package process

import "sync"

type Broadcaster struct{
	mu sync.Mutex
	subscribers map[chan []byte]struct{}
	closed bool
}

func NewBroadcaster() *Broadcaster{
	return &Broadcaster{
		subscribers: make(map[chan []byte]struct{}),
	}
}

func (b *Broadcaster) Subscribe() (<-chan []byte, func()){
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		ch := make(chan []byte)
		close(ch)
		return ch, func() {}
	}

	ch := make(chan []byte, 16)
	b.subscribers[ch] = struct{}{}

	unsub := func ()  {
		b.mu.Lock()
		delete(b.subscribers, ch)
		close(ch)
		b.mu.Unlock()
	}

	return ch, unsub
}

func(b *Broadcaster) Publish(data []byte){
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed{
		return
	}

	for ch := range b.subscribers {
		select{
		case ch <- data:
		default:
		}
	}
}

func (b *Broadcaster) Close(){
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed{
		return
	}
	b.closed = true

	for ch := range b.subscribers{
		close(ch)
	}
	b.subscribers = nil
}