import os

from flask import Flask, redirect, render_template, request, url_for

from incomming_process import icopro

app = Flask(__name__)


@app.route("/", methods=["GET", "POST"])
def home():
    answer = None
    question = None

    if request.method == "POST":
        question = request.form.get("question", "").strip()
        if question:
            answer = icopro(question)

    return render_template("index.html", question=question, answer=answer)


@app.route("/ask-again")
def ask_again():
    return redirect(url_for("home"))


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")
