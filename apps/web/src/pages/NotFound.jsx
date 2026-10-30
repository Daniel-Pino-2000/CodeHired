import { Link } from 'react-router'
import styles from './NotFound.module.css'

export default function NotFoundPage ({ message = "The page you're looking for doesn't exist." }) {
  return (
    <section className={`container ${styles.page}`}>
      <title>Page not found · CodeHired</title>
      <p className={styles.code}>404</p>
      <h1>Nothing to see here</h1>
      <p className={styles.message}>{message}</p>
      <Link to='/search' className='button button-primary'>Browse jobs</Link>
    </section>
  )
}
