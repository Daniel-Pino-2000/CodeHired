import { useSources } from '../hooks/useJobs.js'
import { updatedAgo } from '../utils/format.js'
import styles from './Sources.module.css'

// Credits every data source as its terms ask: by name, with a plain followed link to the source
// and to the terms CodeHired follows. No third-party logos.
export default function SourcesPage () {
  const { sources, updatedAt, loading, error } = useSources()

  return (
    <section className={`container ${styles.page}`}>
      <title>Data sources · CodeHired</title>

      <header className={styles.header}>
        <h1>Where the jobs come from</h1>
        <p className={styles.lead}>
          CodeHired collects US tech jobs from the official, public APIs below, and only from sources
          whose terms allow it. It never scrapes job sites. Every job names the source it was found
          on, and you always apply on the original posting.
        </p>
        {updatedAt && (
          <p className={styles.updated}>
            Jobs last refreshed <time dateTime={updatedAt}>{updatedAgo(updatedAt)}</time>.
          </p>
        )}
      </header>

      {error && <p role='alert' className={styles.error}>Couldn't load the sources: {error.message}</p>}
      {loading && <div className={styles.skeleton} aria-busy='true' aria-label='Loading sources' />}

      {!loading && !error && (
        <ul className={styles.list}>
          {sources.map((source) => (
            <li key={source.id} className={styles.source}>
              <h2 className={styles.name}>
                <a href={source.url} target='_blank' rel='noopener noreferrer'>{source.name}</a>
              </h2>
              <p className={styles.meta}>
                {source.updatedAt
                  ? <>Updated <time dateTime={source.updatedAt}>{updatedAgo(source.updatedAt)}</time></>
                  : 'Not fetched yet'}
                {source.termsUrl && (
                  <>
                    {' · '}
                    <a href={source.termsUrl} target='_blank' rel='noopener noreferrer'>Terms</a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.footnote}>
        The terms of each source, and how CodeHired follows them, are recorded in{' '}
        <a href='https://github.com/Daniel-Pino-2000/CodeHired/blob/main/docs/data-sources.md'>docs/data-sources.md</a>.
        A company that does not want its jobs listed can ask to be removed by{' '}
        <a href='https://github.com/Daniel-Pino-2000/CodeHired/issues'>opening an issue</a>.
      </p>
    </section>
  )
}
