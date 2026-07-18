import React from "react";
import { reportError } from "../monitor";

// Stops a crash in one section (customer site or POS) from white-screening the other.
// React error boundaries only catch render/lifecycle errors in their subtree, so this
// must wrap each app section separately to provide real isolation.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.label || "app"}]`, error, info);
    reportError(
      `[${this.props.label || "app"}] ${error?.message || error}`,
      error?.stack || info?.componentStack
    );
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.handleReload);

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
            fontFamily: "inherit",
          }}
        >
          <h2 style={{ margin: 0 }}>Algo salió mal</h2>
          <p style={{ margin: 0, color: "#666" }}>
            {this.props.message || "Ocurrió un error inesperado. Intenta recargar la página."}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
