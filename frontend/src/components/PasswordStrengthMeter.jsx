import { CheckCircle, XCircle, Minus } from 'lucide-react'

const REQUIREMENTS = [
  { key: 'length', label: '10+ characters', test: (pwd) => pwd.length >= 10 },
  { key: 'uppercase', label: 'Uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
  { key: 'lowercase', label: 'Lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
  { key: 'number', label: 'Number', test: (pwd) => /[0-9]/.test(pwd) },
  { key: 'special', label: 'Special character (!@#$%^&*)', test: (pwd) => /[!@#$%^&*]/.test(pwd) },
  { key: 'noSpaces', label: 'No spaces', test: (pwd) => !/\s/.test(pwd) },
]

function calculateScore(password) {
  if (!password) return 0
  const passed = REQUIREMENTS.filter((r) => r.test(password)).length
  // Base score from requirements (max 60), bonus for extra length (max 40)
  const lengthBonus = Math.min(Math.max(password.length - 10, 0) * 4, 40)
  return Math.min((passed / REQUIREMENTS.length) * 60 + lengthBonus, 100)
}

function getStrengthLabel(score) {
  if (score === 0) return { label: 'Enter password', color: 'bg-gray-200', textColor: 'text-gray-500' }
  if (score < 40) return { label: 'Weak', color: 'bg-red-500', textColor: 'text-red-600' }
  if (score < 70) return { label: 'Fair', color: 'bg-orange-500', textColor: 'text-orange-600' }
  if (score < 90) return { label: 'Good', color: 'bg-yellow-500', textColor: 'text-yellow-600' }
  return { label: 'Strong', color: 'bg-green-500', textColor: 'text-green-600' }
}

export function PasswordStrengthMeter({ password, showRequirements = true }) {
  const score = calculateScore(password)
  const strength = getStrengthLabel(score)

  return (
    <div className="space-y-3">
      {/* Strength Bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-medium text-secondary">Password Strength</span>
          <span className={`text-[12px] font-medium ${strength.textColor}`}>{strength.label}</span>
        </div>
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${strength.color} transition-all duration-300 ease-out rounded-full`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {REQUIREMENTS.map((req) => {
            const met = password ? req.test(password) : null
            return (
              <div key={req.key} className="flex items-center gap-1.5">
                {met === null && <Minus className="h-3.5 w-3.5 text-tertiary" />}
                {met === true && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                {met === false && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                <span
                  className={`text-[12px] ${
                    met === null ? 'text-tertiary' : met ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {req.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
