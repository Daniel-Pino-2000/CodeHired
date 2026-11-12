import { Link } from 'react-router'
import { formatSalary, levelLabel, technologyLabel, timeAgo, workplaceLabel } from '../utils/format.js'
import styles from './JobCard.module.css'

const MAX_TECHNOLOGIES = 4

export function JobCard ({ job }) {
  const salary = formatSalary(job)
  const extraTechnologies = job.technologies.length - MAX_TECHNOLOGIES

  return (
    <article className={styles.card}>
      <div className={styles.avatar} aria-hidden='true'>
        {job.company.charAt(0)}
      </div>

      <div className={styles.body}>
        <header className={styles.header}>
          <h3 className={styles.title}>
            {/* The link covers the whole card (see ::after in the CSS) */}
            <Link to={`/jobs/${job.id}`} className={styles.link}>{job.title}</Link>
          </h3>
          <p className={styles.meta}>
            {job.company} · {job.location}
            {/* Credit the source, as its terms require; the detail page links to the posting */}
            {job.source && <> · via {job.source.name}</>}
          </p>
        </header>

        <ul className={styles.tags} aria-label='Job details'>
          <li className='tag tag-brand'>{workplaceLabel(job.workplace)}</li>
          <li className='tag'>{levelLabel(job.level)}</li>
          {job.technologies.slice(0, MAX_TECHNOLOGIES).map((technology) => (
            <li key={technology} className='tag'>{technologyLabel(technology)}</li>
          ))}
          {extraTechnologies > 0 && <li className='tag'>+{extraTechnologies}</li>}
        </ul>
      </div>

      <div className={styles.aside}>
        {salary && <p className={styles.salary}>{salary}</p>}
        <time className={styles.date} dateTime={job.createdAt}>{timeAgo(job.createdAt)}</time>
      </div>
    </article>
  )
}
