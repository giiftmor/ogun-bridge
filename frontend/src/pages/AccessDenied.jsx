import { Button } from '@/components/ui/button'

export function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="max-w-md w-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
          </svg>
        </div>
        <h1 className="text-[20px] font-medium text-primary mb-2">Access Denied</h1>
        <p className="text-[13px] text-secondary mb-6">
          You are authenticated but not a member of the Ogun Bridge group.
          Contact your administrator if you need access.
        </p>
        <Button
          variant="secondary"
          onClick={() => window.location.href = '/api/auth/logout'}
        >
          Sign Out
        </Button>
      </div>
    </div>
  )
}
