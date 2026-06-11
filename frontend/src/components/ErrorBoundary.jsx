import { Component } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './ui/button'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-danger-bg">
            <AlertCircle className="h-6 w-6 text-danger-text" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium text-primary">Something went wrong</p>
            <p className="text-[12px] text-secondary max-w-md">{this.state.error.message}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </div>
      )
    }
    // eslint-disable-next-line react/prop-types
    return this.props.children
  }
}
