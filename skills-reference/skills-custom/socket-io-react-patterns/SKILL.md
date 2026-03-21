---
name: socket-io-react-patterns
description: Real-time WebSocket patterns with Socket.io and React hooks for live data dashboards, monitoring systems, and real-time communication. Covers connection management, custom hooks, TypeScript integration, and production-ready patterns.
---

# Socket.io React Patterns

Real-time WebSocket communication patterns with Socket.io and React hooks for modern applications.

## Use this skill when

- Building real-time dashboards or monitoring systems
- Creating live data visualization (system metrics, IoT sensors)  
- Implementing chat systems or collaborative features
- Setting up live notifications or alerts
- Building multiplayer applications or games
- Creating real-time data synchronization
- Implementing live commenting or reactions
- Building IoT device monitoring interfaces
- Creating live trading/financial dashboards
- Setting up real-time system health monitoring

## Top 10 Use Cases (Based on GitHub Analysis)

### 1. **Real-Time System Monitoring** (Most Common for Dashboards)
Live CPU, memory, network, and disk metrics

```typescript
// useSystemMetrics.ts
import { useSocket } from './useSocket'
import { useState, useEffect } from 'react'

interface SystemMetrics {
  cpu: number
  memory: { used: number; total: number }
  disk: { used: number; total: number }
  network: { rx: number; tx: number }
}

export const useSystemMetrics = () => {
  const socket = useSocket()
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!socket) return

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)
    const handleMetrics = (data: SystemMetrics) => setMetrics(data)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('system_metrics', handleMetrics)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('system_metrics', handleMetrics)
    }
  }, [socket])

  return { metrics, isConnected }
}
```

### 2. **Live Chat Applications**
Real-time messaging with typing indicators

```typescript
// useChat.ts
interface Message {
  id: string
  user: string
  text: string
  timestamp: number
}

export const useChat = (roomId: string) => {
  const socket = useSocket()
  const [messages, setMessages] = useState<Message[]>([])
  const [typing, setTyping] = useState<string[]>([])

  const sendMessage = (text: string, user: string) => {
    const message: Message = {
      id: Date.now().toString(),
      user,
      text,
      timestamp: Date.now()
    }
    socket?.emit('send_message', { roomId, message })
  }

  const startTyping = (user: string) => {
    socket?.emit('typing_start', { roomId, user })
  }

  const stopTyping = (user: string) => {
    socket?.emit('typing_stop', { roomId, user })
  }

  useEffect(() => {
    if (!socket) return

    socket.emit('join_room', roomId)

    const handleNewMessage = (message: Message) => {
      setMessages(prev => [...prev, message])
    }

    const handleTypingStart = (user: string) => {
      setTyping(prev => prev.includes(user) ? prev : [...prev, user])
    }

    const handleTypingStop = (user: string) => {
      setTyping(prev => prev.filter(u => u !== user))
    }

    socket.on('new_message', handleNewMessage)
    socket.on('user_typing_start', handleTypingStart)
    socket.on('user_typing_stop', handleTypingStop)

    return () => {
      socket.emit('leave_room', roomId)
      socket.off('new_message', handleNewMessage)
      socket.off('user_typing_start', handleTypingStart)
      socket.off('user_typing_stop', handleTypingStop)
    }
  }, [socket, roomId])

  return { messages, typing, sendMessage, startTyping, stopTyping }
}
```

### 3. **Live Data Dashboards**
Real-time metrics visualization

```typescript
// useLiveData.ts
export const useLiveData = <T>(event: string, initialData: T) => {
  const socket = useSocket()
  const [data, setData] = useState<T>(initialData)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    if (!socket) return

    const handleData = (newData: T) => {
      setData(newData)
      setLastUpdate(new Date())
    }

    socket.on(event, handleData)
    return () => socket.off(event, handleData)
  }, [socket, event])

  return { data, lastUpdate }
}

// Usage in component
const DashboardMetrics = () => {
  const { data: cpuData } = useLiveData('cpu_metrics', { usage: 0, temp: 0 })
  const { data: memoryData } = useLiveData('memory_metrics', { used: 0, total: 0 })
  
  return (
    <div>
      <MetricCard title="CPU" value={`${cpuData.usage}%`} />
      <MetricCard title="Memory" value={`${memoryData.used}/${memoryData.total} GB`} />
    </div>
  )
}
```

### 4. **Notification Systems**
Real-time alerts and notifications

```typescript
// useNotifications.ts
interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: number
}

export const useNotifications = () => {
  const socket = useSocket()
  const [notifications, setNotifications] = useState<Notification[]>([])

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  useEffect(() => {
    if (!socket) return

    const handleNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev])
      
      // Auto-remove info notifications after 5 seconds
      if (notification.type === 'info') {
        setTimeout(() => removeNotification(notification.id), 5000)
      }
    }

    socket.on('notification', handleNotification)
    return () => socket.off('notification', handleNotification)
  }, [socket])

  return { notifications, removeNotification }
}
```

### 5. **Connection Status Management**
Robust connection handling with reconnection

```typescript
// useSocket.ts (Core Hook)
import { io, Socket } from 'socket.io-client'
import { useEffect, useState, useRef } from 'react'

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  connectionError: string | null
  reconnectAttempts: number
}

export const useSocket = (url: string = 'http://localhost:3001') => {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    })

    const socket = socketRef.current

    // Connection event handlers
    const handleConnect = () => {
      setIsConnected(true)
      setConnectionError(null)
      setReconnectAttempts(0)
      console.log('Socket connected:', socket.id)
    }

    const handleDisconnect = (reason: string) => {
      setIsConnected(false)
      console.log('Socket disconnected:', reason)
    }

    const handleConnectError = (error: Error) => {
      setConnectionError(error.message)
      console.error('Socket connection error:', error)
    }

    const handleReconnectAttempt = (attemptNumber: number) => {
      setReconnectAttempts(attemptNumber)
    }

    // Register event listeners
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.io.on('reconnect_attempt', handleReconnectAttempt)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.io.off('reconnect_attempt', handleReconnectAttempt)
      socket.disconnect()
    }
  }, [url])

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    reconnectAttempts
  }
}
```

### 6. **Real-Time Collaboration**
Live document editing with conflict resolution

```typescript
// useCollaboration.ts
interface DocumentChange {
  id: string
  userId: string
  type: 'insert' | 'delete' | 'replace'
  position: number
  content: string
  timestamp: number
}

export const useCollaboration = (documentId: string) => {
  const socket = useSocket()
  const [document, setDocument] = useState('')
  const [activeUsers, setActiveUsers] = useState<string[]>([])
  const [changes, setChanges] = useState<DocumentChange[]>([])

  const applyChange = (change: DocumentChange) => {
    socket?.emit('document_change', { documentId, change })
  }

  useEffect(() => {
    if (!socket) return

    socket.emit('join_document', documentId)

    const handleDocumentUpdate = (newDocument: string) => {
      setDocument(newDocument)
    }

    const handleUserJoined = (userId: string) => {
      setActiveUsers(prev => [...prev, userId])
    }

    const handleUserLeft = (userId: string) => {
      setActiveUsers(prev => prev.filter(id => id !== userId))
    }

    const handleChange = (change: DocumentChange) => {
      setChanges(prev => [...prev, change])
    }

    socket.on('document_updated', handleDocumentUpdate)
    socket.on('user_joined_document', handleUserJoined)
    socket.on('user_left_document', handleUserLeft)
    socket.on('document_change', handleChange)

    return () => {
      socket.emit('leave_document', documentId)
      socket.off('document_updated', handleDocumentUpdate)
      socket.off('user_joined_document', handleUserJoined)
      socket.off('user_left_document', handleUserLeft)
      socket.off('document_change', handleChange)
    }
  }, [socket, documentId])

  return { document, activeUsers, changes, applyChange }
}
```

### 7. **Gaming/Multiplayer Features**
Real-time game state synchronization

```typescript
// useGameState.ts
interface GameState {
  players: Record<string, Player>
  gameStatus: 'waiting' | 'playing' | 'finished'
  currentTurn?: string
  score: Record<string, number>
}

interface Player {
  id: string
  name: string
  position: { x: number; y: number }
  isOnline: boolean
}

export const useGameState = (gameId: string) => {
  const socket = useSocket()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [playerId, setPlayerId] = useState<string>('')

  const makeMove = (move: any) => {
    socket?.emit('game_move', { gameId, playerId, move })
  }

  const joinGame = (playerName: string) => {
    socket?.emit('join_game', { gameId, playerName })
  }

  useEffect(() => {
    if (!socket) return

    const handleGameStateUpdate = (newState: GameState) => {
      setGameState(newState)
    }

    const handlePlayerAssigned = (id: string) => {
      setPlayerId(id)
    }

    socket.on('game_state_updated', handleGameStateUpdate)
    socket.on('player_assigned', handlePlayerAssigned)

    return () => {
      socket.off('game_state_updated', handleGameStateUpdate)
      socket.off('player_assigned', handlePlayerAssigned)
    }
  }, [socket])

  return { gameState, playerId, makeMove, joinGame }
}
```

### 8. **IoT Device Monitoring**
Real-time sensor data visualization

```typescript
// useIoTDevices.ts
interface DeviceReading {
  deviceId: string
  sensorType: 'temperature' | 'humidity' | 'pressure' | 'motion'
  value: number
  unit: string
  timestamp: number
}

interface Device {
  id: string
  name: string
  location: string
  isOnline: boolean
  lastSeen: number
  readings: DeviceReading[]
}

export const useIoTDevices = () => {
  const socket = useSocket()
  const [devices, setDevices] = useState<Record<string, Device>>({})
  const [selectedDevice, setSelectedDevice] = useState<string>('')

  const subscribeToDevice = (deviceId: string) => {
    socket?.emit('subscribe_device', deviceId)
    setSelectedDevice(deviceId)
  }

  const unsubscribeFromDevice = (deviceId: string) => {
    socket?.emit('unsubscribe_device', deviceId)
  }

  useEffect(() => {
    if (!socket) return

    const handleDeviceUpdate = (device: Device) => {
      setDevices(prev => ({
        ...prev,
        [device.id]: device
      }))
    }

    const handleSensorReading = (reading: DeviceReading) => {
      setDevices(prev => ({
        ...prev,
        [reading.deviceId]: {
          ...prev[reading.deviceId],
          readings: [reading, ...prev[reading.deviceId]?.readings || []].slice(0, 100) // Keep last 100 readings
        }
      }))
    }

    const handleDeviceStatus = (deviceId: string, isOnline: boolean) => {
      setDevices(prev => ({
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          isOnline,
          lastSeen: Date.now()
        }
      }))
    }

    socket.on('device_updated', handleDeviceUpdate)
    socket.on('sensor_reading', handleSensorReading)
    socket.on('device_status_changed', handleDeviceStatus)

    return () => {
      socket.off('device_updated', handleDeviceUpdate)
      socket.off('sensor_reading', handleSensorReading)
      socket.off('device_status_changed', handleDeviceStatus)
    }
  }, [socket])

  return { 
    devices: Object.values(devices), 
    selectedDevice, 
    subscribeToDevice, 
    unsubscribeFromDevice 
  }
}
```

### 9. **Live Trading Dashboard**
Financial data streaming

```typescript
// useTradingData.ts
interface PriceUpdate {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  timestamp: number
}

interface OrderBookEntry {
  price: number
  size: number
  side: 'buy' | 'sell'
}

export const useTradingData = (symbols: string[]) => {
  const socket = useSocket()
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({})
  const [orderBook, setOrderBook] = useState<Record<string, OrderBookEntry[]>>({})

  const subscribeToSymbol = (symbol: string) => {
    socket?.emit('subscribe_ticker', symbol)
    socket?.emit('subscribe_orderbook', symbol)
  }

  const unsubscribeFromSymbol = (symbol: string) => {
    socket?.emit('unsubscribe_ticker', symbol)
    socket?.emit('unsubscribe_orderbook', symbol)
  }

  useEffect(() => {
    if (!socket) return

    symbols.forEach(subscribeToSymbol)

    const handlePriceUpdate = (update: PriceUpdate) => {
      setPrices(prev => ({
        ...prev,
        [update.symbol]: update
      }))
    }

    const handleOrderBookUpdate = (symbol: string, book: OrderBookEntry[]) => {
      setOrderBook(prev => ({
        ...prev,
        [symbol]: book
      }))
    }

    socket.on('price_update', handlePriceUpdate)
    socket.on('orderbook_update', handleOrderBookUpdate)

    return () => {
      symbols.forEach(unsubscribeFromSymbol)
      socket.off('price_update', handlePriceUpdate)
      socket.off('orderbook_update', handleOrderBookUpdate)
    }
  }, [socket, symbols])

  return { prices, orderBook, subscribeToSymbol, unsubscribeFromSymbol }
}
```

### 10. **Live Polling/Voting**
Real-time poll results

```typescript
// usePolling.ts
interface PollOption {
  id: string
  text: string
  votes: number
}

interface Poll {
  id: string
  question: string
  options: PollOption[]
  totalVotes: number
  isActive: boolean
  endTime?: number
}

export const usePolling = (pollId: string) => {
  const socket = useSocket()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string>('')

  const vote = (optionId: string) => {
    if (!hasVoted && poll?.isActive) {
      socket?.emit('cast_vote', { pollId, optionId })
    }
  }

  useEffect(() => {
    if (!socket) return

    socket.emit('join_poll', pollId)

    const handlePollUpdate = (updatedPoll: Poll) => {
      setPoll(updatedPoll)
    }

    const handleVoteConfirmed = (optionId: string) => {
      setHasVoted(true)
      setSelectedOption(optionId)
    }

    socket.on('poll_updated', handlePollUpdate)
    socket.on('vote_confirmed', handleVoteConfirmed)

    return () => {
      socket.emit('leave_poll', pollId)
      socket.off('poll_updated', handlePollUpdate)
      socket.off('vote_confirmed', handleVoteConfirmed)
    }
  }, [socket, pollId])

  return { poll, hasVoted, selectedOption, vote }
}
```

## Core Setup Patterns

### Socket Context Provider

```typescript
// SocketContext.tsx
import React, { createContext, useContext, ReactNode } from 'react'
import { useSocket } from './useSocket'

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  connectionError: string | null
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export const SocketProvider: React.FC<{ children: ReactNode; url?: string }> = ({ 
  children, 
  url = 'http://localhost:3001' 
}) => {
  const socketState = useSocket(url)

  return (
    <SocketContext.Provider value={socketState}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocketContext = () => {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocketContext must be used within a SocketProvider')
  }
  return context
}
```

### Error Handling and Retry Logic

```typescript
// useSocketWithRetry.ts
export const useSocketWithRetry = (url: string, maxRetries: number = 5) => {
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const socket = useSocket(url)

  const retry = useCallback(() => {
    if (retryCount < maxRetries) {
      setIsRetrying(true)
      setTimeout(() => {
        setRetryCount(prev => prev + 1)
        setIsRetrying(false)
      }, Math.pow(2, retryCount) * 1000) // Exponential backoff
    }
  }, [retryCount, maxRetries])

  return { ...socket, retryCount, isRetrying, retry }
}
```

## Production Considerations

### Performance Optimization
- Use event namespacing to reduce unnecessary re-renders
- Implement proper cleanup in useEffect return functions
- Consider using refs for frequently changing data that doesn't need rerenders
- Throttle high-frequency events (sensor data, mouse movements)

### Error Handling
- Implement exponential backoff for reconnections
- Handle network timeouts gracefully
- Provide user feedback for connection states
- Store critical data locally during disconnections

### Security
- Validate all incoming data on client side
- Use proper authentication tokens
- Implement rate limiting for events
- Sanitize user inputs before emission

This skill provides production-ready patterns for Socket.io integration with React, covering the most common real-time application scenarios.