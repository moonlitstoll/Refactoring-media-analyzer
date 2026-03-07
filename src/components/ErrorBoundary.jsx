import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <h3 className="font-bold mb-2">Something went wrong.</h3>
                    <p className="text-sm font-mono whitespace-pre-wrap">{this.state.error?.toString()}</p>
                    <button onClick={() => this.setState({ hasError: false })} className="mt-3 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-xs font-bold transition-colors">
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
