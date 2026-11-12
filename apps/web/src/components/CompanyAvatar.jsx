import { useState } from 'react'
import styles from './CompanyAvatar.module.css'

// The company's logo when there is one (and it loads), its initial otherwise
export function CompanyAvatar ({ name, logoUrl, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const className = `${styles.avatar} ${styles[size]}`

  if (logoUrl && !failed) {
    return (
      <img
        className={className}
        src={logoUrl}
        alt=''
        loading='lazy'
        referrerPolicy='no-referrer'
        onError={() => setFailed(true)}
      />
    )
  }

  return <div className={className} aria-hidden='true'>{name.charAt(0)}</div>
}
