export function ChatPreview() {
  return (
    <div className="hero-panel" aria-label="Chat system preview">
      <div className="panel-top">
        <div className="agent">
          <span className="agent-avatar">M</span>
          <span>Monirujjaman</span>
        </div>
        <div className="status"><span className="dot" />Available now</div>
      </div>
      <div className="chat-preview">
        <div className="bubble bubble-left">Hello! How can we help you?</div>
        <div className="bubble bubble-right">I need help with my order.</div>
        <div className="bubble bubble-left">Thanks for reaching out. I am checking this for you.</div>
        <div className="quick-row">
          <span className="quick-chip">Checking</span>
          <span className="quick-chip">Please wait</span>
          <span className="quick-chip">Resolved</span>
        </div>
      </div>
    </div>
  );
}
