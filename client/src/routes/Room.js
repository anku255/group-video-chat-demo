import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import styled from "styled-components";

const Container = styled.div`
    padding: 20px;
    display: flex;
    height: 100vh;
    width: 90%;
    margin: auto;
    flex-wrap: wrap;
`;

const StyledVideo = styled.video`
    height: 40%;
    width: 50%;
`;

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        props.peer.on("stream", stream => {
            ref.current.srcObject = stream;
        })
    }, []);

    return (
        <StyledVideo playsInline autoPlay ref={ref} />
    );
}


const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2
};

const Room = (props) => {
    const [peers, setPeers] = useState([]);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const roomID = props.match.params.roomID;


    /**
     * Note to self:
     * The way WebRTC works is that we need to have a two way handshakes before any data exchange
     * can take place.
     * 
     * WebRTC doesn't specify how to make this handshake happen. We will be using sockets for communication.
     * The acutal video stream will be communicated over WebRTC, however we need sockets to communicate other informations.
     * 
     * The flow will be like - 
     * 
     * 1. When a user joins a room
     *  - Create a Peer for each of the user
     *  - Send a signal to each user using the socket connection
     *  - The reciever will send the signal back, completing a handshake
     */

    useEffect(() => {
        // Initialize socketRef
        // Connects to the socket server 
        socketRef.current = io.connect("/");

        // Ask for camera and microphone access
        navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true }).then(stream => {
            // Display our own video
            userVideo.current.srcObject = stream;
            // Emit an event "join room" for all the other users in this room
            socketRef.current.emit('join room', roomID);

            // Ther server will emit an event "all users"
            // Listen to this event and create Peer for each of the user

            socketRef.current.on('all users', users => {
                const peers = [];
                users.forEach(userID => {
                    // Creating a new peer
                    // 
                    const peer = createPeer(userID, socketRef.current.id, stream);
                    peersRef.current.push({
                        peerID: userID,
                        peer
                    });
                    peers.push(peer);
                });
                setPeers(peers);
            });

            // When an existing user receives an event for newly joined user
            socketRef.current.on('user joined', payload => {
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer
                });
                setPeers(users => [...users, peer]);
            });


            // recieve the returned signal by other users
            socketRef.current.on('receiving returned signal', payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                item.peer.signal(payload.signal);
            })
        })
    }, []);


    function createPeer(userToSignal, callerID, stream) {
       const peer = new Peer({
           initiator: true, // This will immediately fire a signal event 
           trickle: false,
           stream
       });

       // Once the signal event is fired
       // We need to send this to the reciever for the handshake
       peer.on("signal", signal => {
           socketRef.current.emit('sending signal', { userToSignal, callerID, signal });
       });

       return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false, // No need to fire the signal event as we are not initiating the peer
            trickle: false,
            stream
        });

        // Accepting the signal that the user sent
        peer.signal(incomingSignal);

        // Tt will be fired when we signal on the incomingSignal above
        // Now we need to send our sigal to them using sockets
        peer.on('signal', signal => {
            // Emit an event "returning signal" to the server
            socketRef.current.emit('returning signal', {signal, callerID});
        })

        return peer;
    }

    return (
        <Container>
            <StyledVideo muted ref={userVideo} autoPlay playsInline />
            {peers.map((peer, index) => {
                return (
                    <Video key={index} peer={peer} />
                );
            })}
        </Container>
    );
};

export default Room;
