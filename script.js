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
  const panel = document.getElementById("learnMorePanel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth" });
}

function showAccolades(type) {
  document.getElementById("hoopAccolades").classList.add("hidden");
  document.getElementById("otherAccolades").classList.add("hidden");

  if (type === "hoop") {
    document.getElementById("hoopAccolades").classList.remove("hidden");
  } else if (type === "other") {
    document.getElementById("otherAccolades").classList.remove("hidden");
  }
}

type();
