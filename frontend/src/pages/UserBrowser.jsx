import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, User, UserCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SkeletonList } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { apiClient } from '@/services/api'

export function UserBrowser() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)

  const debouncedSearch = useDebounce(searchTerm, 300)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', debouncedSearch],
    queryFn: () => apiClient.getUsers({ search: debouncedSearch }),
    refetchInterval: false,
  })

  const filteredUsers = users?.filter(user => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      user.username.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      user.name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-2">
          Browse and manage user profiles
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, email, or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User List + Detail */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {filteredUsers?.length || 0} Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonList items={8} />
            ) : filteredUsers && filteredUsers.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredUsers.map((user) => (
                  <UserListItem
                    key={user.id}
                    user={user}
                    selected={selectedUser?.id === user.id}
                    onClick={() => setSelectedUser(user)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Details */}
        <div className="sticky top-6">
          {selectedUser ? (
            <UserDetails user={selectedUser} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a user to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function UserListItem({ user, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${selected
          ? 'bg-primary/5 border-primary'
          : 'hover:bg-accent border-transparent'
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{user.username}</span>
            {!user.isActive && (
              <Badge variant="secondary" className="text-xs">Inactive</Badge>
            )}
          </div>
          {user.email && (
            <div className="text-sm text-muted-foreground truncate">
              {user.email}
            </div>
          )}
          {user.name && (
            <div className="text-sm text-muted-foreground truncate">
              {user.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!user.hasPassword ? (
            <Badge variant="secondary" className="text-xs">No Password</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Has Password</Badge>
          )}
        </div>
      </div>
    </button>
  )
}

function UserDetails({ user }) {
  const navigate = useNavigate()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>User Details</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/users/${user.username}`)}>
              <UserCircle className="h-4 w-4 mr-2" />
              Full Profile
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold mb-3">Basic Information</h3>
          <div className="space-y-2 text-sm">
            <DetailRow label="Username" value={user.username} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Name" value={user.name} />
            <DetailRow
              label="Status"
              value={
                <Badge variant={user.isActive ? 'default' : 'secondary'}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              }
            />
            <DetailRow label="Password" value={user.hasPassword ? 'Set' : 'Not set'} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
