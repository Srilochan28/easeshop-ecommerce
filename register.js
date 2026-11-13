
// ShopEase Customer Registration

const registerForm = document.getElementById("registerForm");

const registerMessage =
    document.getElementById("registerMessage");

const registerButton =
    document.getElementById("registerButton");

registerForm.addEventListener("submit", async event => {

    event.preventDefault();

    const fullName =
        document.getElementById("fullName").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (!fullName || !email || !password || !confirmPassword) {
        registerMessage.textContent =
            "Please fill in all fields.";
        return;
    }

    if (password.length < 8) {
        registerMessage.textContent =
            "Password must contain at least 8 characters.";
        return;
    }

    if (password !== confirmPassword) {
        registerMessage.textContent =
            "Passwords do not match.";
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";

    registerMessage.textContent = "";

    try {

        const response = await fetch("/api/customers/register", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                full_name: fullName,
                email: email,
                password: password
            })

        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Registration failed."
            );
        }

        registerMessage.textContent =
            "Registration successful! You can now log in.";

        registerMessage.style.color = "green";

        registerForm.reset();

    } catch (error) {

        registerMessage.textContent = error.message;
        registerMessage.style.color = "red";

    } finally {

        registerButton.disabled = false;
        registerButton.textContent = "Create Account";

    }

});
