package main

import (
	"fmt"
	"os"
	"net/http"
	"code.google.com/p/go.net/websocket"
	"encoding/json"
)

// member: returns true if string a is in string slice arr
func member(a string, arr []string) bool {
	for _, s := range arr {
		if a == s {
			return true
		}
	}
	return false
}

// Type Endpoint represents one endpoint in the chat
type Endpoint struct {
	WebSocket *websocket.Conn
	Name string
	MessageChannel chan EndpointMessage
	State string
	Peer *Endpoint // Peer endpoint in a call
	Text string
}

// NewEndpoint is a constructor for Endpoint
func NewEndpoint(ws *websocket.Conn) *Endpoint {
	ep := &Endpoint{WebSocket: ws, MessageChannel: make(chan EndpointMessage)}
	ep.State = "INITIAL"
	return ep
}

// ProcessMessages processes messages received by the endpoint
func (ep *Endpoint) ProcessMessages() {
	for {
		m, ok := <- ep.MessageChannel
		if ok {
			fmt.Println("Endpoint: received message of type", m.MessageType)
			fmt.Println("   state is", ep.State)
			fmt.Println("   name is `", ep.Name, "'")
			switch m.MessageType {
				case  "REGISTER_SUCCESS":
					msg, _ := json.Marshal(map[string]string{"messageType": m.MessageType})
					fmt.Println("Sending message ", string(msg))
					websocket.Message.Send(ep.WebSocket, string(msg))
					ep.State = "REGISTERED"
					ep.Name = m.Name
				case "REGISTER_FAILURE":
					fmt.Println("Endpoint: sending register failure to browser")
					msg, _ := json.Marshal(map[string]string{"messageType": m.MessageType, "text": m.Text})
					websocket.Message.Send(ep.WebSocket, string(msg))
					fmt.Println("Endpoint: after")
				case "UNREGISTER":
					ep.State = "INITIAL"
					ep.Name = ""
				case "CALL":
					g_Dispatcher.C <- DispatcherMessage{MessageType: "CALL", Name: m.Name, Endpoint: ep}
					ep.State = "CALLING"
				case "INBOUND_CALL":
					ep.Peer = m.Endpoint
					ep.State = "INBOUND_CALL"
					msg, _ := json.Marshal(map[string]string{"messageType": "INBOUND_CALL", "name": m.Name})
					websocket.Message.Send(ep.WebSocket, string(msg))
				case "OUTBOUND_CALL":
					if ep.State == "REGISTERED" {
						ep.Peer = m.Endpoint
						ep.State = "CALLING"
					}
				case "WS_CLOSED":
					fmt.Println("Endpoint: exiting")
					if ep.State == "IN_CALL" {
						ep.Peer.MessageChannel <- EndpointMessage{MessageType: "HANGUP"}
					}
					ep.State = "INITIAL"
					return
				case "ACCEPT":
					if ep.State == "INBOUND_CALL" {
						ep.State = "IN_CALL"
						ep.Peer.MessageChannel <- EndpointMessage{MessageType: "OTHER_ACCEPT"}
					} else {
						fmt.Println("Endpoint: received ACCEPT in wrong state (", ep.State, ")")
					}
				case "REJECT":
					if ep.State == "INBOUND_CALL" {
						ep.Peer.MessageChannel <- EndpointMessage{MessageType: "REJECT"}
						ep.State = "REGISTERED"
					} else if ep.State == "CALLING" {
						msg, _ := json.Marshal(map[string]string{"messageType": "REJECT"})
						websocket.Message.Send(ep.WebSocket, string(msg))
						ep.State = "REGISTERED"
					}
				case "REJECT_UNKNOWN":
					if ep.State == "REGISTERED" {
						msg, _ := json.Marshal(map[string]string{"messageType": "REJECT_UNKNOWN"})
						websocket.Message.Send(ep.WebSocket, string(msg))
					}
				case "REJECT_ILLEGAL":
					if ep.State == "REGISTERED" {
						msg, _ := json.Marshal(map[string]string{"messageType": "REJECT_ILLEGAL"})
						websocket.Message.Send(ep.WebSocket, string(msg))
					}
				case "OTHER_ACCEPT":
					if ep.State == "CALLING" {
						ep.State = "IN_CALL"
					}
					msg, _ := json.Marshal(map[string]string{"messageType": "ACCEPT", "name": m.Name})
					websocket.Message.Send(ep.WebSocket, string(msg))
				case "MESSAGE":
					if ep.State == "IN_CALL" {
						ep.Peer.MessageChannel <- EndpointMessage{MessageType: "INBOUND_MESSAGE", Text: m.Text}
					}
				case "INBOUND_MESSAGE":
					msg, _ := json.Marshal(map[string]string{"messageType": "INBOUND_MESSAGE", "text": m.Text})
					websocket.Message.Send(ep.WebSocket, string(msg))
				case "HANGUP":
					if member(ep.State, []string{"IN_CALL", "CALLING"}) {
						ep.Peer.MessageChannel <- EndpointMessage{MessageType: "OTHER_HANGUP"}
						ep.State = "REGISTERED"
					}
				case "OTHER_HANGUP":
					msg, _ := json.Marshal(map[string]string{"messageType": m.MessageType})
					websocket.Message.Send(ep.WebSocket, string(msg))
					ep.State = "REGISTERED"
			}
		} else {
			fmt.Println("ProcessMessages: receive failed")
		}
	}
}

type EndpointMessage struct {
	Endpoint *Endpoint
	MessageType string
	Name string
	Text string
}

type Dispatcher struct {
	C DispatcherChannel
	Endpoints map[string] *Endpoint
}

type DispatcherMessage struct {
	MessageType string
	Name string
	Endpoint *Endpoint
}

type DispatcherChannel chan DispatcherMessage

func NewDispatcher() *Dispatcher {
	d := &Dispatcher{C: make(chan DispatcherMessage), Endpoints: make(map[string] *Endpoint)}
	return d
}

// DispatcherLoop processes messages for the dispatcher
func (d *Dispatcher) DispatcherLoop() {
	for {
		select {
			case m := <- d.C:
				fmt.Println("DispatcherLoop: received message", m.MessageType)
				switch m.MessageType {
					 case "REGISTER":
						fmt.Println("DispatcherLoop: processing registration")
						fmt.Println("DispatcherLoop: registering name", m.Name)
						if m.Endpoint == nil {
							fmt.Println("DispatcherLoop: endpoint nil")
							continue
						}
						fmt.Println("DispatcherLoop: endpoint OK")
						_, ok := d.Endpoints[m.Name]
						if ok {
							fmt.Println("DispatcherLoop: name already registered")
							// TODO: return error
							m.Endpoint.MessageChannel <- EndpointMessage{MessageType: "REGISTER_FAILURE",
								Text: fmt.Sprintf("%s is already registered", m.Name)}
							continue
						}
						d.Endpoints[m.Name] = m.Endpoint
						m.Endpoint.MessageChannel <- EndpointMessage{MessageType: "REGISTER_SUCCESS", Name: m.Name}
					case "UNREGISTER":
						fmt.Println("DispatcherLoop: processing unregistration")
						ep, ok := d.Endpoints[m.Endpoint.Name]
						if !ok {
							fmt.Println("DispatcherLoop: name", m.Endpoint.Name, "not registered");
						} else if ep != m.Endpoint {
							fmt.Println("DispatcherLoop: name", m.Endpoint.Name, "registered to a different endpoint")
						} else {
							fmt.Println("DispatcherLoop: unregistering endpoint", m.Endpoint.Name)
							delete(d.Endpoints, m.Endpoint.Name)
							ep.MessageChannel <- EndpointMessage{MessageType: "UNREGISTER"}
						}
					case "CALL":
						fmt.Println("DispatcherLoop: processing CALL")
						fmt.Println("DispatcherLoop: calling", m.Name, "from", m.Endpoint.Name)
						ep, ok := d.Endpoints[m.Name]
						if ok {
							ep.MessageChannel <- EndpointMessage{MessageType: "INBOUND_CALL", Endpoint: m.Endpoint, Name: m.Endpoint.Name}
							if m.Endpoint != nil {
								fmt.Println("DispatcherLoop: sending OUTBOUND_CALL to", m.Endpoint.Name)
								m.Endpoint.MessageChannel <- EndpointMessage{MessageType: "OUTBOUND_CALL", Endpoint: ep, Name: m.Name}
							}
						} else {
							fmt.Println("DispatcherLoop: unknown callee")
							// Send rejection to calling endpoint
							m.Endpoint.MessageChannel <- EndpointMessage{MessageType: "REJECT_UNKNOWN"}
						}
					case "WS_CLOSED":
						fmt.Println("DispatcherLoop: processing WS_CLOSED")
						if m.Endpoint.Name != "" {
							delete(d.Endpoints, m.Endpoint.Name)
							m.Endpoint.MessageChannel <- EndpointMessage{MessageType: "WS_CLOSED"}
						}
				}
		}
	}
}

var g_Dispatcher *Dispatcher

func main() {
	fmt.Println("hello wschat2")

	if len(os.Args) != 2 {
		fmt.Println("Usage: wschat port")
		os.Exit(0)
	}
	
	g_Dispatcher = NewDispatcher()
	go g_Dispatcher.DispatcherLoop()

	port := os.Args[1]
	fmt.Println("Serving websocket on port", port)
	service := ":" + port

	http.Handle("/websocket/", websocket.Handler(ProcessSocket))
	err := http.ListenAndServe(service, nil)
	checkError(err)
}

func ProcessSocket(ws *websocket.Conn) {
	fmt.Println("In ProcessSocket")

	ep := NewEndpoint(ws)
	go ep.ProcessMessages()
	
	var msg string
	
	for {
		err := websocket.Message.Receive(ws, &msg)
		if err != nil {
			fmt.Println("ProcessSocket: got error", err)
			g_Dispatcher.C <- DispatcherMessage{MessageType: "WS_CLOSED", Endpoint: ep}
			return
		}
		fmt.Println("ProcessSocket: got message", msg)

		decoded := new(map[string] string)
		err = json.Unmarshal([]byte(msg), decoded)
		if err != nil {
			fmt.Println("Received message is not JSON:", msg)
			continue
		} else {
			fmt.Println("Received JSON message:", *decoded)
		}
		
		msgType, ok := (*decoded)["type"]
		if !ok {
			continue
		}

		switch msgType {
			case "REGISTER":
				name, ok := (*decoded)["name"]
				if ok {
					fmt.Println("Received registration message for name =", name)
					g_Dispatcher.C <- DispatcherMessage{MessageType: msgType, Name: name, Endpoint: ep}
				} else {
					fmt.Println("Received registration message without name")
				}
			case "UNREGISTER":
				g_Dispatcher.C <- DispatcherMessage{MessageType: msgType, Endpoint: ep}
			case "CALL":
				name, ok := (*decoded)["name"]
				if ok {
					fmt.Println("Received CALL message for name =", name)
					if name == ep.Name {
						fmt.Println("Caller trying to call themselves")
						ep.MessageChannel <- EndpointMessage{MessageType: "REJECT_ILLEGAL"}
					} else {
						g_Dispatcher.C <- DispatcherMessage{MessageType: msgType, Name: name, Endpoint: ep}
						fmt.Println("Sent message to endpoint")
					}
				} else {
					fmt.Println("Received CALL message without name")
				}
			case "ACCEPT":
				fmt.Println("Callee accepted call")
				ep.MessageChannel <- EndpointMessage{MessageType: msgType}
			case "REJECT":
				fmt.Println("Callee rejected call")
				ep.MessageChannel <- EndpointMessage{MessageType: msgType}
			case "MESSAGE":
				text, ok := (*decoded)["text"]
				if ok {
					ep.MessageChannel <- EndpointMessage{MessageType: "MESSAGE", Text: text}
				}
			case "HANGUP":
				ep.MessageChannel <- EndpointMessage{MessageType: msgType}
		}
	}
}

func checkError(err error) {
	if err != nil {
		fmt.Println("Error:", err.Error())
		os.Exit(1)
	}
}

