import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#FBEAE6", minHeight: "100vh" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#C1432B", marginBottom: 10 }}>Something crashed on this page</div>
          <div style={{ fontSize: 13, color: "#1B2B2E", marginBottom: 14 }}>Take a screenshot of everything below and send it — this tells us exactly what broke.</div>
          <div style={{ background: "#fff", border: "1px solid #C1432B", borderRadius: 8, padding: 14, marginBottom: 14, whiteSpace: "pre-wrap", fontSize: 12.5 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          {this.state.info?.componentStack && (
            <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap", fontSize: 11, color: "#516361", maxHeight: 240, overflowY: "auto" }}>
              {this.state.info.componentStack}
            </div>
          )}
          <button
            onClick={() => this.setState({ error: null, info: null })}
            style={{ marginTop: 16, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontFamily: "inherit" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
