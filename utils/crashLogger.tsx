import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';

const MAX_LOGS = 100;
const logBuffer: string[] = [];

function recordLog(level: string, ...args: any[]) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const formatted = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');
  const entry = `[${timestamp}] [${level}] ${formatted}`;
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
}

// Hook into console to record breadcrumbs
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args: any[]) => {
  recordLog('LOG', ...args);
  originalLog.apply(console, args);
};

console.warn = (...args: any[]) => {
  recordLog('WARN', ...args);
  originalWarn.apply(console, args);
};

console.error = (...args: any[]) => {
  recordLog('ERROR', ...args);
  originalError.apply(console, args);
};

// Global Error Handler via ErrorUtils
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const defaultHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    const errorMsg = `FATAL JS ERROR (isFatal=${isFatal}): ${error?.message || error}\nStack: ${error?.stack || 'No stack'}`;
    recordLog('FATAL', errorMsg);
    originalError('[CRASH_LOGGER]', errorMsg);

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
    originalError('[AppCrashErrorBoundary] Caught error:', error, errorInfo);
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
    color: '#ff4d4f',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 12,
  },
  stackScrollView: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    color: '#ffd591',
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  stackText: {
    color: '#ff7875',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logText: {
    color: '#91d5ff',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  retryButton: {
    backgroundColor: '#ff4d4f',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
