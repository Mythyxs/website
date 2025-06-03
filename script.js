const phrases = ["C++", "Python", "Batch", "Lua"];
const shuffled = phrases.sort(() => Math.random() - 0.5);

let index = 0;
let charIndex = 0;
const typingEl = document.getElementById("typing");

function type() {
  if (charIndex <= shuffled[index].length) {
    typingEl.innerText = shuffled[index].slice(0, charIndex++);
    setTimeout(type, 100);
  } else {
    setTimeout(() => {
      charIndex = 0;
      index = (index + 1) % shuffled.length;
      type();
    }, 1500);
  }
}

function glowButtonClick() {
  document.getElementById("accolades").scrollIntoView({ behavior: "smooth" });
}

type();
