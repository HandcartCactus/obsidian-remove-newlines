from github import Github
from collections import Counter
from datetime import datetime, timezone
from statistics import mean, median
import os
import pandas as pd
# import matplotlib.pyplot as plt

g = Github(
    os.getenv("GITHUB_STATS_READ_TOKEN")
)
repo = g.get_repo("HandcartCactus/obsidian-remove-newlines")

releases = list(repo.get_releases())
latest_release = repo.get_latest_release()
issues = list(repo.get_issues(state="all"))
traffic = repo.get_views_traffic()

all_closed_issues = [issue for issue in issues if issue.state == "closed"]
all_open_issues = [issue for issue in issues if issue.state == "open"]

release_dates = [release.created_at for release in releases]
release_dates.sort()
stats = {}
latest_release_tag_name = latest_release.tag_name
release_downloads = {
    release.tag_name: sum(
        asset.download_count
        for asset in release.get_assets()
        if asset.name == "main.js"
    )
    for release in releases
}
top_referrers = {
    referrer.referrer: referrer.count for referrer in repo.get_top_referrers()
}
closed_issues = len(list(all_closed_issues))
open_issues = len(list(all_open_issues))
closure_rate = round(closed_issues / (closed_issues + open_issues), 2)
median_closure_seconds = (
    None
    if not all_closed_issues
    else median(
        [
            (issue.closed_at - issue.created_at).total_seconds()
            for issue in all_closed_issues
        ]
    )
)
average_time_between_releases_seconds = (
    None
    if len(release_dates) < 2
    else mean(
        (b - a).total_seconds() for a, b in zip(release_dates[:-1], release_dates[1:])
    )
)
seconds_since_last_release = (
    datetime.now(timezone.utc) - latest_release.created_at.astimezone(timezone.utc)
).total_seconds()
current_release_downloads = sum(
    asset.download_count
    for asset in latest_release.get_assets()
    if asset.name == "main.js"
)
max_release_downloads = max(
    sum(
        asset.download_count
        for asset in release.get_assets()
        if asset.name == "main.js"
    )
    for release in releases
)
total_downloads = sum(
    sum(
        asset.download_count
        for asset in release.get_assets()
        if asset.name == "main.js"
    )
    for release in releases
)
est_users_non_current_release = max_release_downloads - current_release_downloads
unique_views = traffic["uniques"]


def scale_interval(seconds):
    intervals = [
        ("year", 60 * 60 * 24 * 365),
        ("month", 60 * 60 * 24 * 30),
        ("week", 60 * 60 * 24 * 7),
        ("day", 60 * 60 * 24),
        ("hour", 60 * 60),
        ("minute", 60),
        ("second", 1),
    ]

    for name, count in intervals:
        value = seconds / count
        if value >= 1:
            return f"{value:.1f} {name}{'s' if value != 1 else ''}"

    return "0 seconds"


filename = "repo_metrics.csv"

metrics = {
    "data_as_of": datetime.now(timezone.utc),
    "latest_release": latest_release.tag_name,
    "stargazers_count": repo.stargazers_count,
    "closed_issues": closed_issues,
    "open_issues": open_issues,
    "closure_rate": closure_rate,
    "median_closure_seconds": median_closure_seconds,
    "average_time_between_releases_seconds": average_time_between_releases_seconds,
    "seconds_since_last_release": seconds_since_last_release,
    "current_release_downloads": current_release_downloads,
    "max_release_downloads": max_release_downloads,
    "total_downloads": total_downloads,
    "est_users_non_current_release": est_users_non_current_release,
    "unique_views": unique_views,
    "release_downloads": release_downloads,
    "top_referrers": top_referrers,
}

mdf = pd.DataFrame.from_records([metrics])
if os.path.exists(filename):
    df = pd.read_csv(filename)
    df = pd.concat([df, mdf], ignore_index=True)
else:
    df = mdf
df["data_as_of"] = pd.to_datetime(df["data_as_of"])
df.to_csv(filename, index=False)

# print(df)
# print(df.info())
# print(df.describe())
# df.plot.line("data_as_of", "total_downloads")
# plt.title("Total Downloads Over Time")
# plt.xlabel("Time")
# plt.ylabel("Total Downloads")
# plt.tight_layout()
# plt.savefig("total_downloads_over_time.png")
