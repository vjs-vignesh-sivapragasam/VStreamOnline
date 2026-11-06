import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';

const MAX_LOGS = 50;
const logBuffer: string[] = [];

function recordLog(level: string, message: string) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const entry = `[${timestamp}] [${level}] ${message}`;
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
}

// Global Error Handler via ErrorUtils for uncaught fatal crashes only
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const defaultHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    const errorMsg = `FATAL JS ERROR (isFatal=${isFatal}): ${error?.message || error}\nStack: ${error?.stack || 'No stack'}`;
    recordLog('FATAL', errorMsg);
    try {
      console.error('[CRASH_LOGGER] ' + errorMsg);
    } catch {}

    if (defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });
}

export function getRecentLogs(): string[] {
  return [...logBuffer];
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppCrashErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    recordLog('REACT_CRASH', `${error.message}\n${errorInfo.componentStack}`);
    try {
      console.error('[AppCrashErrorBoundary] Caught error:', error?.message);
    } catch {}
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Application Crashed (RCA Diagnostics)</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.name}: {this.state.error?.message}
          </Text>
          <ScrollView style={styles.stackScrollView}>
            <Text style={styles.sectionHeader}>Stack Trace:</Text>
            <Text style={styles.stackText}>{this.state.error?.stack || 'No stack trace'}</Text>
            <Text style={styles.sectionHeader}>Component Stack:</Text>
            <Text style={styles.stackText}>{this.state.errorInfo?.componentStack || 'No component stack'}</Text>
            <Text style={styles.sectionHeader}>Recent Logs:</Text>
            <Text style={styles.logText}>{getRecentLogs().join('\n')}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRestart}>
            <Text style={styles.retryButtonText}>Retry Application</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#111111',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff4444',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 12,
  },
  stackScrollView: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stackText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#ff8888',
    lineHeight: 16,
  },
  logText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#cccccc',
    lineHeight: 16,
  },
  retryButton: {
    backgroundColor: '#333333',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
