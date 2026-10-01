import { Component } from "react";

// Catches a render-time exception so one broken screen shows a recoverable
// message instead of blanking the whole app. App.jsx keys the screen-level
// boundary by route, so navigating elsewhere clears the error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="eb-panel" role="alert">
        <h2 className="eb-title">This screen ran into a problem</h2>
        <p className="eb-text">
          Something unexpected happened while showing this page. Your saved work is not affected. Reload to try
          again, or go back to the work queue.
        </p>
        {error?.message && <pre className="eb-detail">{String(error.message)}</pre>}
        <div className="eb-actions">
          <button type="button" className="btn-modern btn-primary-modern eb-btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="btn-modern btn-outline-modern eb-btn" href={`${import.meta.env.BASE_URL}work-queue`}>
            Go to work queue
          </a>
        </div>
      </div>
    );
  }
}
