import { useState } from 'react'
import { useWasm } from './wasm/useWasm'
import './App.css'

function App() {
  const { status, error } = useWasm()
  const [response, setResponse] = useState<string | null>(null)

  const handlePing = () => {

    if (status === 'ready' && window.goPing) {
      const result = window.goPing('Wave_')
      setResponse(result)
    }

  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🌊 Wave Overlap — WASM Bridge Test</h1>

      <div style={{ margin: '1.5rem 0' }}>
        <strong>WASM Status: </strong>
        {status === 'loading' && <span style={{ color: '#f0ad4e' }}>⏳ Loading...</span>}
        {status === 'ready' && <span style={{ color: '#5cb85c' }}>✅ Ready</span>}
        {status === 'error' && <span style={{ color: '#d9534f' }}>❌ Error: {error}</span>}
      </div>

      <div style={{ margin: '1.5rem 0' }}>
        <strong>SharedArrayBuffer: </strong>
        {typeof SharedArrayBuffer !== 'undefined'
          ? <span style={{ color: '#5cb85c' }}>✅ Available</span>
          : <span style={{ color: '#d9534f' }}>❌ Not available (check COOP/COEP headers)</span>
        }
      </div>

      <button
        onClick={handlePing}
        disabled={status !== 'ready'}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          cursor: status === 'ready' ? 'pointer' : 'not-allowed',
          background: status === 'ready' ? '#0275d8' : '#555',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Call goPing("Wave_Overlap")
      </button>

      {response && (
        <pre style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#1e1e1e',
          color: '#4ec9b0',
          borderRadius: '6px',
          fontSize: '1.1rem',
        }}>
          {response}
        </pre>
      )}
    </div>
  )
}

export default App
