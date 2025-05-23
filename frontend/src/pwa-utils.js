// This file contains utility functions for PWA functionality

// Function to show a notification when new content is available
export function showUpdateNotification(registration) {
  const notification = document.createElement("div")
  notification.className = "update-notification"
  notification.innerHTML = `
    <div class="update-notification-content">
    </div>
  `

  document.body.appendChild(notification)

  // This won't work since there's no element with id 'update-app' anymore
  // You should either remove this listener or repurpose it
  // document.getElementById("update-app").addEventListener("click", () => {
  //   if (registration && registration.waiting) {
  //     registration.waiting.postMessage({ type: "SKIP_WAITING" })
  //   }
  //   notification.remove()
  //   window.location.reload()
  // })
}

// Function to check if the app is installed
export function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
}

// Function to show install prompt
export function showInstallPrompt(deferredPrompt) {
  if (!deferredPrompt) return

  const installPrompt = document.createElement("div")
  installPrompt.className = "install-prompt"
  installPrompt.innerHTML = `
    <div class="install-prompt-content">
      <p>Install VolunteerHub for a better experience!</p>
      <div class="install-buttons">
        <button id="install-app">Install</button>
        <button id="dismiss-install">Not now</button>
      </div>
    </div>
  `

  document.body.appendChild(installPrompt)

  document.getElementById("install-app").addEventListener("click", async () => {
    deferredPrompt.prompt()
    const choiceResult = await deferredPrompt.userChoice
    installPrompt.remove()
    deferredPrompt = null
  })

  document.getElementById("dismiss-install").addEventListener("click", () => {
    installPrompt.remove()
  })
}

// Add CSS for the notifications
const style = document.createElement("style")
style.textContent = `
  .update-notification, .install-prompt {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 16px;
    z-index: 1000;
    max-width: 1%;
    width: 1px;
  }

  .update-notification-content, .install-prompt-content {
    display: none;
    flex-direction: column;
    align-items: center;
  }

  .install-buttons {
    display: none;
    gap: 12px;
    margin-top: 12px;
  }

  button {
    padding: 1px 1px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }
`
document.head.appendChild(style)
