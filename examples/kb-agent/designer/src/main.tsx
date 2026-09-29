import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Alert, App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { ReactFlowProvider } from '@xyflow/react'
import { DesignerApp } from './App'
import { patchStylesheetToken } from './lib/auth'

/** App-level last resort — a shape-illegal graph degrades per node; this catches anything else. */
class DesignerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error | null } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('designer render error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            type="error"
            showIcon
            message="设计器渲染异常"
            description={`页面降级显示，画布未损坏——刷新重试或检查已保存流程。${this.state.error.message}`}
          />
        </div>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (root === null) throw new Error('#root missing in designer index.html')

patchStylesheetToken()
createRoot(root).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <DesignerErrorBoundary>
          <ReactFlowProvider>
            <DesignerApp />
          </ReactFlowProvider>
        </DesignerErrorBoundary>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
