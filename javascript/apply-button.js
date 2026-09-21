const jobsListingSection = document.querySelector('.jobs-listings')

jobsListingSection.addEventListener('click', function(event) {
  const element = event.target

  if (element.classList.contains('button-apply-job')) {
    element.textContent = '¡Aplicado!'
    element.classList.add('is-applied')
    element.disabled = true
  }
})


// - Comentarios con otros eventos interesantes

// otras formas de añadir eventos click a elementos
// recupera solo el primer boton que encuentre
// const boton = document.querySelector('.button-apply-job')
// console.log(boton) // null si no lo encuentra

// if (boton !== null) {
//   boton.addEventListener('click', function() {
//     boton.textContent = '¡Aplicado!'
//     boton.classList.add('is-applied')
//     boton.disabled = true
//   })
// }

// const botones = document.querySelectorAll('.button-apply-job')
// // devuelve un NodeList (array-like) con todos los botones que encuentre
// // o una lista vacia [] si no encuentra ninguno

// botones.forEach(boton => {
//   boton.addEventListener('click', function() {
//     boton.textContent = '¡Aplicado!'
//     boton.classList.add('is-applied')
//     boton.disabled = true
//   })
// })

// ejemplos de eventos
// const searchInput = document.querySelector('#empleos-search-input')

// searchInput.addEventListener('input', function() {
//   console.log(searchInput.value)
// })

// searchInput.addEventListener('blur', function() {
//   console.log('Se dispara cuando el campo pierde el foco')
// })

// const searchForm = document.querySelector('#empleos-search-form')

// searchForm.addEventListener('submit', function(event) {
//   event.preventDefault()
//   // ... todo lo que yo te diga aqui
//   console.log('submit')
// })

// document.addEventListener('keydown', function(event) {
//   console.log("Tecla presionada: ", event.key)
//   console.log("¿Está pulsada la tecla shift?", event.shiftKey)
//   console.log("¿Está pulsada la tecla ctrl?", event.ctrlKey)
//   console.log("¿Está pulsada la tecla alt?", event.altKey)
// })