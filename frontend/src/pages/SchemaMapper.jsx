import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, TestTube, Plus, Trash2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function SchemaMapper() {
  const queryClient = useQueryClient()
  const [testUserId, setTestUserId] = useState('')
  const [testResult, setTestResult] = useState(null)

  const { data: mappings, isLoading } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: apiClient.getFieldMappings.bind(apiClient),
  })

  const updateMutation = useMutation({
    mutationFn: apiClient.updateFieldMapping.bind(apiClient),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-mappings'] })
      toast.success('Mappings updated successfully!')
    },
  })

  const testMutation = useMutation({
    mutationFn: apiClient.testMapping.bind(apiClient),
    onSuccess: (data) => {
      setTestResult(data)
    },
    onError: (error) => {
      setTestResult({ error: error.message })
    },
  })

  const handleTest = () => {
    if (!testUserId) {
      toast.error('Please enter a user ID to test')
      return
    }
    testMutation.mutate({ userId: testUserId, mappings })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading mappings...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schema Mapper</h1>
        <p className="text-muted-foreground mt-2">
          Configure how Authentik fields map to LDAP attributes
        </p>
      </div>

      {/* Mapping Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Field Mappings</CardTitle>
          <CardDescription>
            Map Authentik user fields to LDAP attributes. Required fields must have values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Core Required Mappings */}
            <div>
              <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
                Required Attributes
              </h3>
              <div className="space-y-3">
                <MappingRow
                  authentikField="username"
                  ldapAttribute="uid"
                  required={true}
                  description="Unique identifier"
                  locked={true}
                />
                <MappingRow
                  authentikField="email"
                  ldapAttribute="mail"
                  required={true}
                  description="Email address"
                  transformation="If empty, generate from username@domain"
                />
                <MappingRow
                  authentikField="name"
                  ldapAttribute="cn"
                  required={true}
                  description="Common name (full name)"
                  transformation="If empty, use username"
                />
                <MappingRow
                  authentikField="name || username"
                  ldapAttribute="sn"
                  required={true}
                  description="Surname (last name)"
                  transformation="If empty, use username"
                  highlight={true}
                />
              </div>
            </div>

            {/* Optional Mappings */}
            <div>
              <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
                Optional Attributes
              </h3>
              <div className="space-y-3">
                <MappingRow
                  authentikField="phone"
                  ldapAttribute="telephoneNumber"
                  required={false}
                  description="Phone number"
                />
                <MappingRow
                  authentikField="groups"
                  ldapAttribute="memberOf"
                  required={false}
                  description="Group memberships"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={() => updateMutation.mutate(mappings)}
                disabled={updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Mappings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Mapping */}
      <Card>
        <CardHeader>
          <CardTitle>Test Mapping</CardTitle>
          <CardDescription>
            Preview how a user's data will be transformed for LDAP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter username (e.g., akadmin)"
                value={testUserId}
                onChange={(e) => setTestUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              />
              <Button
                onClick={handleTest}
                disabled={testMutation.isPending || !testUserId}
              >
                <TestTube className="h-4 w-4 mr-2" />
                Test
              </Button>
            </div>

            {testMutation.isPending && (
              <div className="text-center py-4 text-muted-foreground">
                Testing mapping...
              </div>
            )}

            {testResult && (
              <TestResult result={testResult} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mapping Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Mapping Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Common Issues & Solutions</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>
                  <strong>Invalid Attribute Syntax:</strong> Usually means a required field is missing or empty
                </li>
                <li>
                  <strong>Missing 'sn' (surname):</strong> Use fallback: name || username
                </li>
                <li>
                  <strong>Missing email:</strong> Generate: username@yourdomain.com
                </li>
                <li>
                  <strong>Empty 'cn' (common name):</strong> Use username as fallback
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Transformation Syntax</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>
                  <code className="bg-muted px-1 py-0.5 rounded">field1 || field2</code> - Use field1 if exists, otherwise field2
                </li>
                <li>
                  <code className="bg-muted px-1 py-0.5 rounded">field + "@domain.com"</code> - Generate email from username
                </li>
                <li>
                  <code className="bg-muted px-1 py-0.5 rounded">default("value")</code> - Use default value if field is empty
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MappingRow({ authentikField, ldapAttribute, required, description, transformation, locked, highlight }) {
  return (
    <div className={`p-4 rounded border ${highlight ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-300 dark:border-yellow-700' : 'bg-muted/50'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{authentikField}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono text-sm font-medium">{ldapAttribute}</span>
            {required && (
              <Badge variant="error" className="text-xs">Required</Badge>
            )}
            {locked && (
              <Badge variant="secondary" className="text-xs">Locked</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {transformation && (
            <div className="flex items-start gap-2 mt-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                <strong>Transformation:</strong> {transformation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TestResult({ result }) {
  if (result.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900 dark:text-red-100">Test Failed</h4>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{result.error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Authentik Data */}
      <div>
        <h4 className="font-semibold mb-2 text-sm">Authentik Data (Source)</h4>
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-sm">
          <pre className="text-xs overflow-auto">
            {JSON.stringify(result.authentikData, null, 2)}
          </pre>
        </div>
      </div>

      {/* Generated LDAP Entry */}
      <div>
        <h4 className="font-semibold mb-2 text-sm">Generated LDAP Entry</h4>
        <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-sm">
          <pre className="text-xs overflow-auto">
            {JSON.stringify(result.ldapEntry, null, 2)}
          </pre>
        </div>
      </div>

      {/* Validation Results */}
      {result.validation && (
        <div>
          <h4 className="font-semibold mb-2 text-sm">Validation</h4>
          {result.validation.valid ? (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-sm">
              <p className="text-sm text-green-700 dark:text-green-300">
                ✓ All required attributes present and valid
              </p>
            </div>
          ) : (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm">
              <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2">
                Validation Errors:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700 dark:text-red-300">
                {result.validation.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
