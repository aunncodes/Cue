import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/react'
import { createContext, useContext, type ReactNode } from 'react'

type CueAuthValue = {
  configured: boolean
  isLoaded: boolean
  isSignedIn: boolean
  getToken: () => Promise<string | null>
}

const signedOutAuth: CueAuthValue = {
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  getToken: async () => null,
}

const CueAuthContext = createContext<CueAuthValue>(signedOutAuth)

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()

  return (
    <CueAuthContext.Provider
      value={{
        configured: true,
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        getToken,
      }}
    >
      {children}
    </CueAuthContext.Provider>
  )
}

export function CueAuthProvider({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()

  if (!publishableKey) {
    return <CueAuthContext.Provider value={signedOutAuth}>{children}</CueAuthContext.Provider>
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  )
}

export function useCueAuth() {
  return useContext(CueAuthContext)
}

export function AccountControl() {
  const { configured } = useCueAuth()
  if (!configured) return null

  return (
    <div className="account-control">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className="sign-in-button">Sign in</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'cue-user-avatar',
            },
          }}
        />
      </Show>
    </div>
  )
}
