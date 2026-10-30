import styles from './Footer.module.css'

export function Footer () {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p>© {new Date().getFullYear()} CodeHired</p>
        <p>
          Built by <a href='https://github.com/Daniel-Pino-2000'>Daniel Pino</a>, following
          the architecture of <a href='https://github.com/midudev/jscamp'>midudev's JSCamp</a>
        </p>
      </div>
    </footer>
  )
}
