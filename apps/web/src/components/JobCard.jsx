import { Link } from 'react-router'
import { formatSalary, levelLabel, sourceLabel, technologyLabel, timeAgo, workplaceLabel } from '../utils/format.js'
import { CompanyAvatar } from './CompanyAvatar.jsx'
import styles from './JobCard.module.css'

const MAX_TECHNOLOGIES = 4

export function JobCard ({ job }) {
  const salary = formatSalary(job)
  const extraTechnologies = job.technologies.length - MAX_TECHNOLOGIES

  return (
    <article className={styles.card}>
      <CompanyAvatar name={job.company} logoUrl={job.companyProfile?.logoUrl} />

      <div className={styles.body}>
        <header className={styles.header}>
          <h3 className={styles.title}>
            {/* The link covers the whole card (see ::after in the CSS) */}
            <Link to={`/jobs/${job.id}`} className={styles.link}>{job.title}</Link>
          </h3>
          <p className={styles.meta}>
            {/* Above the card-wide link, so it opens the company page instead */}
            {job.companyProfile
              ? <Link to={`/companies/${job.companyProfile.slug}`} className={styles.company}>{job.company}</Link>
              : job.company}
            {' · '}{job.location}
            {/* Credit the source, as its terms require; the detail page links to the posting */}
            {job.source && <> · via {sourceLabel(job.source)}</>}
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
