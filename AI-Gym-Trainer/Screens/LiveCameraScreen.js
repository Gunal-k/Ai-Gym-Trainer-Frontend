import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { COLORS } from '../constants/theme';
import * as Speech from 'expo-speech';

// --- IMPORTANT: Set your WebSocket URL here ---
// Use 'ws://' instead of 'http://'
const backendWsUrl = process.env.EXPO_PUBLIC_POSE_SERVICE_URL;
const SPEECH_INTERVAL = 4000;
const FRAME_PROCESSOR_INTERVAL = 1500;

const LiveCameraScreen = ({ navigation }) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState(true);
  const [feedback, setFeedback] = useState('Align yourself in the frame.');
  const [reps, setReps] = useState(0);
  const [exercise, setExercise] = useState('None');


  const [cameraFacing, setCameraFacing] = useState('front');
  const [speechQueue, setSpeechQueue] = useState(null);
  
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(cameraFacing);

  const socket = useRef(null);
  const audioFeedbackRef = useRef(audioFeedback);
  const cameraRef = useRef(null);

  const lastSpokenFeedback = useRef(null);
  const lastSpokenTime = useRef(0);

  useEffect(() => {
    audioFeedbackRef.current = audioFeedback;
  }, [audioFeedback]);

  // --- ADDED: Function to toggle camera
  const toggleCameraFacing = () => {
    setCameraFacing(current => (current === 'front' ? 'back' : 'front'));
  };

  useEffect(() => {
    if (speechQueue) {
      Speech.speak(speechQueue);
      setSpeechQueue(null); // Clear the queue after speaking
    }
  }, [speechQueue]);

  // Effect to manage WebSocket connection and frame sending interval
  useEffect(() => {
    if (!isSessionActive) {
      if (socket.current) socket.current.close();
      return;
    }

    socket.current = new WebSocket(backendWsUrl);
    socket.current.onopen = () => console.log('WebSocket connection opened.');
    socket.current.onclose = () => console.log('WebSocket connection closed.');
    socket.current.onerror = (error) => Alert.alert('WebSocket Error', 'Connection failed.');
    
    socket.current.onmessage = (event) => {
      // Add a check to ensure there's data before parsing
      if (event.data) {
        const data = JSON.parse(event.data);

        if (data.feedback) {
          setFeedback(data.feedback);

          const now = Date.now();
          const isNewFeedback = data.feedback !== lastSpokenFeedback.current;
          const hasEnoughTimePassed = now - lastSpokenTime.current > SPEECH_INTERVAL;

          if (audioFeedbackRef.current && (isNewFeedback || hasEnoughTimePassed)) {
            setSpeechQueue(data.feedback);
            lastSpokenFeedback.current = data.feedback;
            lastSpokenTime.current = now;
          }
        }

        // 🟢 Add these lines
        if (data.reps !== undefined) setReps(data.reps);
        if (data.exercise) setExercise(data.exercise);
      }
    };


    // Use setInterval to periodically take a photo
    const frameSender = setInterval(async () => {
      if (cameraRef.current && socket.current && socket.current.readyState === WebSocket.OPEN) {
        const photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'speed',
          skipMetadata: true,
        });
        
        // Convert the photo to Base64 to send
        const response = await fetch(`file://${photo.path}`);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            if (socket.current?.readyState === WebSocket.OPEN) {
                socket.current.send(base64String);
            }
        };
        reader.readAsDataURL(blob);
      }
    }, FRAME_PROCESSOR_INTERVAL);

    // Cleanup function
    return () => {
      clearInterval(frameSender);
      if (socket.current) socket.current.close();
      Speech.stop();
    };
  }, [isSessionActive]); // Send a frame every 1.5 seconds

  if (!isSessionActive) {
    return (
      <SafeAreaView style={styles.startSessionSafeArea}>
        <StatusBar style="dark" />
        <View style={styles.startSessionContainer}>
          <Ionicons name="sparkles-outline" size={64} color={COLORS.primary} />
          <Text style={styles.startSessionTitle}>Ready for your workout?</Text>
          <Text style={styles.startSessionSubtitle}>
            The AI trainer will use your camera to provide real-time feedback on your form.
          </Text>
          <TouchableOpacity
            style={styles.startSessionButton}
            onPress={() => setIsSessionActive(true)}>
            <Text style={styles.startSessionButtonText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Handle permission states
  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView style={styles.startSessionSafeArea}>
        <Text>No camera device found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <StatusBar style="light" />

      {/* Layer 1: The Camera View (in the background) */}
      <Camera
        ref={cameraRef} // Add the ref here
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isSessionActive && AppState.currentState === 'active'}
        photo={true} // Enable photo mode
      />

      {/* Layer 2: The UI Overlay (on top) */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          
          <View style={styles.topContent}>
            <View style={styles.topControlsContainer}>
              {/* Audio Toggle Button */}
              <TouchableOpacity style={styles.audioToggle} onPress={() => setAudioFeedback(!audioFeedback)}>
                <Ionicons name={audioFeedback ? "volume-high" : "volume-mute"} size={20} color={COLORS.textDark} />
                <Text style={styles.audioText}>{audioFeedback ? "On" : "Off"}</Text>
              </TouchableOpacity>
              <Text style={styles.repText}>Reps: {reps}</Text>
              <Text style={styles.exerciseText}>Exercise: {exercise}</Text> 
              {/* Camera Switch Button */}
              <TouchableOpacity style={styles.controlButton} onPress={toggleCameraFacing}>
                <Ionicons name="camera-reverse-outline" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.poseBox}>
            <Text style={styles.poseBoxText}>{feedback}</Text>
          </View>

          <View style={styles.bottomContent}>
            <TouchableOpacity style={styles.endButton} onPress={() => setIsSessionActive(false)}>
              <Text style={styles.endButtonText}>End Session</Text>
            </TouchableOpacity>
          </View>
          
        </View>
      </SafeAreaView>
    </View>
  );
};


const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.transparentBlack,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
  },
  topContent: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textLight,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.9,
  },
  topControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  poseBox: {
    width: '90%',
    aspectRatio: 2.5 / 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  poseBoxText: {
    color: COLORS.textLight,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontWeight: '600',
  },
  bottomContent: {
    marginTop: 20,
    width: '100%',
    paddingBottom: 10, // Space above the tab bar
  },
  endButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  endButtonText: {
    color: COLORS.textDark,
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Permission styles
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.textDark,
  },
  permissionText: {
    textAlign: 'center',
    fontSize: 18,
    color: COLORS.textLight,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: COLORS.textDark,
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Start Session Styles
  startSessionSafeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  startSessionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  startSessionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'center',
    marginTop: 24,
  },
  startSessionSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 40,
    lineHeight: 24,
  },
  startSessionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 18,
    paddingHorizontal: 60,
    borderRadius: 28,
  },
  startSessionButtonText: {
    color: COLORS.textDark,
    fontSize: 18,
    fontWeight: 'bold',
  },
  // --- ADDED STYLES ---
  audioToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  audioText: {
    color: COLORS.textDark,
    marginLeft: 8,
    fontWeight: '600',
  },
  repText: {
    color: COLORS.textLight,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 6,
  },
  exerciseText: {
    color: COLORS.textLight,
    fontSize: 18,
    marginTop: 2,
    fontStyle: 'italic',
  },
});

export default LiveCameraScreen;