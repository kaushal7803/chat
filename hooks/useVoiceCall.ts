'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';
import { CallState, IncomingCallPayload } from '@/types';

const ICE_SERVERS = {
  iceServers: [
    // Google's STUN servers for fast peer discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // 🛡️ TURN Relay Servers to bypass cellular/corporate NAT firewalls
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export function useVoiceCall() {
  const { data: session } = useSession();
  const socket = getSocket();
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  
  // Store physical stream entities in reactive state to decouple from DOM
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callTarget, setCallTarget] = useState<string | null>(null); 
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  
  // Capture and present errors gracefully instead of silently failing/blinking
  const [callError, setCallError] = useState<string | null>(null);

  // Real-time Media Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC media tracks and channels...');
    
    pcRef.current?.close();
    pcRef.current = null;
    
    // Clean up and close hardware tracks reactively
    setLocalStream((prevStream) => {
      if (prevStream) {
        prevStream.getTracks().forEach((track) => {
          console.log(`Releasing hardware track: ${track.kind}`);
          track.stop(); // Turns off camera light immediately!
        });
      }
      return null;
    });

    setRemoteStream(null);
    setCallState('idle');
    setCallTarget(null);
    setIncomingCall(null);
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  const createPC = useCallback((targetId: string) => {
    if (!socket) return null;
    
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('call:ice', { to: targetId, candidate });
      }
    };

    pc.ontrack = ({ streams }) => {
      console.log('Received remote stream pipeline:', streams[0]);
      // Reactive set triggers DOM connection seamlessly inside UI component
      setRemoteStream(streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log('PC Connection State Changed:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [socket, cleanup]);

  // ── Active In-Call Handlers ───────────────────────────────────────
  
  const toggleMute = useCallback(() => {
    if (localStream) {
      const nextState = !isMuted;
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextState;
      });
      setIsMuted(nextState);
    }
  }, [localStream, isMuted]);

  const toggleCamera = useCallback(() => {
    if (localStream) {
      const nextState = !isCamOff;
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !nextState;
      });
      setIsCamOff(nextState);
    }
  }, [localStream, isCamOff]);

  // ── Start a Call (Audio + Video) ──────────────────────────────────
  const startCall = useCallback(
    async (targetSocketId: string) => {
      if (!session?.user || !socket) return;
      const user = session.user as any;

      console.log('Initiating full media stream setup to:', targetSocketId);
      setCallTarget(targetSocketId);
      setCallState('calling');
      setCallError(null); // Reset past errors

      try {
        // 1. Verify modern secure origin constraints before calling
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera access blocked. Modern browsers REQUIRE 'localhost' or 'HTTPS' secure origins for WebRTC!");
        }

        // 2. Capture Streams with Intelligent Fallback
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (mediaErr: any) {
          console.warn("Dual capture failed, falling back to voice...", mediaErr);
          const errMsg = mediaErr.message?.toLowerCase() || "";
          if (
            mediaErr.name === 'NotFoundError' || 
            mediaErr.name === 'DevicesNotFoundError' || 
            errMsg.includes('not found') || 
            errMsg.includes('notreadableerror')
          ) {
            // Device missing - Fallback to voice
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setIsCamOff(true); // Pre-set UI to Camera Off
          } else {
            throw mediaErr; // Rethrow (e.g. permissions)
          }
        }
        setLocalStream(stream);

        // 3. Configure Peer Pipeline
        const pc = createPC(targetSocketId);
        if (!pc) return;
        
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call:offer', {
          to: targetSocketId,
          from: socket.id,
          offer,
          callerName: user.name,
          callerImage: user.image,
        });
      } catch (err: any) {
        console.error('MEDIA ACCESS ERROR:', err);
        setCallError(err.message || "Could not access camera or microphone. Verify permissions.");
        // NOTE: We keep callState at 'calling' so the UI can display the error card!
      }
    },
    [session, socket, createPC]
  );

  // ── Accept Incoming Call (Audio + Video) ───────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socket) return;

    const targetId = incomingCall.from;
    console.log('Accepting caller media stream connection:', targetId);
    setCallTarget(targetId);
    setCallState('connected');
    setCallError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access blocked. Secure origins (localhost/HTTPS) are REQUIRED!");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (mediaErr: any) {
        console.warn("Incoming dual capture failed, falling back to voice...", mediaErr);
        const errMsg = mediaErr.message?.toLowerCase() || "";
        if (
          mediaErr.name === 'NotFoundError' || 
          mediaErr.name === 'DevicesNotFoundError' || 
          errMsg.includes('not found') || 
          errMsg.includes('notreadableerror')
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setIsCamOff(true);
        } else {
          throw mediaErr;
        }
      }
      setLocalStream(stream);

      const pc = createPC(targetId);
      if (!pc) return;
      
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:answer', { to: targetId, answer });
      setIncomingCall(null);
    } catch (err: any) {
      console.error('ACCEPTING MEDIA ERROR:', err);
      setCallError(err.message || "Could not access media device for incoming connection.");
    }
  }, [incomingCall, socket, createPC]);

  // ── Reject / End call ─────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (incomingCall && socket) {
      socket.emit('call:reject', { to: incomingCall.from });
    }
    cleanup();
  }, [incomingCall, socket, cleanup]);

  const endCall = useCallback(() => {
    if (callTarget && socket) {
      socket.emit('call:end', { to: callTarget });
    }
    cleanup();
  }, [callTarget, socket, cleanup]);

  // ── Socket event listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: any) => {
      console.log('Socket received remote call offer:', data);
      setCallError(null);
      setIncomingCall(data);
      setCallState('incoming');
    };

    const handleCallAnswer = async ({ answer }: any) => {
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('Failed remote answer apply:', e);
        }
      }
    };

    const handleCallIce = async ({ candidate }: any) => {
      if (pcRef.current && candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('ICE candidate mount fail:', e);
        }
      }
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:answer', handleCallAnswer);
    socket.on('call:ice', handleCallIce);
    socket.on('call:rejected', cleanup);
    socket.on('call:ended', cleanup);

    return () => {
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:answer', handleCallAnswer);
      socket.off('call:ice', handleCallIce);
      socket.off('call:rejected', cleanup);
      socket.off('call:ended', cleanup);
    };
  }, [socket, cleanup]);

  return {
    callState,
    incomingCall,
    callTarget,
    localStream,
    remoteStream,
    callError,
    isMuted,
    isCamOff,
    toggleMute,
    toggleCamera,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
