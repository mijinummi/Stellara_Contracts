export enum ConversationState {
  LISTENING = 'listening',
  THINKING = 'thinking',
  RESPONDING = 'responding',
  INTERRUPTED = 'interrupted',
  IDLE = 'idle',
  /** Heartbeat timed out; session is pending cleanup by the cron job */
  STALE = 'stale',
  /** Session was explicitly terminated */
  TERMINATED = 'terminated',
}
