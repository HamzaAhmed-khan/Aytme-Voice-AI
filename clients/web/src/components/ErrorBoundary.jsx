import React from 'react';
import { AlertCircle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800 px-4">
                    <div className="max-w-md text-center">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-rose-500" />
                        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                        <p className="text-slate-500 text-sm mb-4">
                            An unexpected error occurred. Please try refreshing the page.
                        </p>
                        <details className="text-left bg-white border border-slate-200 p-4 rounded-lg mb-4 text-xs shadow-sm">
                            <summary className="cursor-pointer font-mono text-rose-500 mb-2">Error details</summary>
                            <pre className="overflow-auto text-slate-600">
                                {this.state.error?.toString()}
                            </pre>
                        </details>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
