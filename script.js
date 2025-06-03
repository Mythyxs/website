const phrases = ["Web Developer", "Gamer", "Anime Enthusiast", "Designer"];
let index = 0;
let charIndex = 0;
const typingEl = document.getElementById("typing");

function type() {
  if (charIndex <= phrases[index].length) {
    typingEl.innerText = phrases[index].slice(0, charIndex++);
    setTimeout(type, 100);
  } else {
    setTimeout(() => {
      charIndex = 0;
      index = (index + 1) % phrases.length;
      type();
    }, 1500);
  }
}

function glowButtonClick() {
  alert("More coming soon...");
}

type();
