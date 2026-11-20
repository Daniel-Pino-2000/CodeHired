import { useCallback, useEffect, useState } from 'react'

// Notices when the candidate comes back after following an "Apply on ..." link, which opens the
// posting in a new tab: this tab is hidden (or the window loses focus) while they are there, and
// becomes visible again when they return. `asking` turns true then, so the page can ask whether
// they applied. Following the link again while asking changes nothing.
export function useReturnAfterApply () {
  // 'idle', 'away' (the link was followed) or 'asking'
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (state !== 'away') return

    const handleReturn = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) setState('asking')
    }

    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleReturn)
    return () => {
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleReturn)
    }
  }, [state])

  const onApply = useCallback(() => setState((current) => (current === 'asking' ? current : 'away')), [])
  const dismiss = useCallback(() => setState('idle'), [])

  return { asking: state === 'asking', onApply, dismiss }
}
