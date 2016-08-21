/*

TODO:
    - consider adding a key that notes how points are calculated

*/

(() => {

    const API_KEY = "565ec012251f932ea4000001cafc2a100a034ce6614e2d2c36138196"

    window.soccer = {}
    var $loadingSpan

    $(function() {
        $loadingSpan = $("<span/>").addClass("loading").text("Loading...")
        $("body").append($loadingSpan)

        fetch(`http://api.football-api.com/2.0/standings/1204?Authorization=${API_KEY}`)
            .then(response => response.json())
            .then(buildTeamList)
            .catch(showError)
    })

    function buildTeamList(response) {
        $loadingSpan.remove()
        $(".error").remove()

        var $alphabeticallySortedTeams = response
            .sort((a, b) => {
                var nameA = a.team_name.toLowerCase(),
                    nameB = b.team_name.toLowerCase();

                if (nameA < nameB) {
                    return -1
                } else if (nameA > nameB) {
                    return 1
                } else {
                    return 0
                }
            })
            .map(team =>
                $("<option/>")
                    .attr("data-team-id", team.team_id)
                    .text(`${team.team_name}`)
            )

        $("body")
            .prepend($("<p/>").attr("id", "teamsSection").text("Team: ")
                .append($("<select/>").attr("id", "teams")
                    .append($alphabeticallySortedTeams)
                )
            )

        $("#teams").select2()
        $("#teamsSection .select2").after($("<button/>").attr("id", "teambutton").text("Go"))

        $("#teambutton").click(function() {
            window.soccer.teamNameForResults = $('#teams :selected').val()

            var teamId = window.soccer.teamIdForResults = $('#teams :selected').data("team-id"),
                $teamButton = $("#teambutton")
                    .attr("disabled", "disabled")
                    .after($loadingSpan);

            fetch(`http://api.football-api.com/2.0/matches?comp_id=1204&team_id=${teamId}&from_date=20160812&to_date=20170531&Authorization=${API_KEY}`)
                .then(response => response.json())
                .then(response => {
                    $teamButton.removeAttr("disabled")
                    $loadingSpan.remove()
                    buildGameList(response)
                })
                .catch(showError)
        })
    }

    function buildGameList(response) {
        window.soccer.matchesReponse = response

        $("#teamsSection").nextAll().remove()
        $(".error").remove()

        var $dateSortedGames = response
            .sort((a, b) => dottedDateStringToDate(a.formatted_date) - dottedDateStringToDate(b.formatted_date))
            .map(game => {
                var isHomeTeam = game.localteam_id == window.soccer.teamIdForResults,
                    firstTeamName = isHomeTeam ? game.localteam_name : game.visitorteam_name,
                    secondTeamName = isHomeTeam ? game.visitorteam_name : game.localteam_name,
                    $option = $("<option/>")
                        .attr("data-game-id", game.id)
                        .text(`${printPrettyDate(game.formatted_date)}: ${firstTeamName} vs. ${secondTeamName}`)

                // if the game hasn't happened or isn't over yet
                if (/\[\-\]/.test(game.ft_score)) {
                    $option.attr("disabled", "disabled")
                }

                return $option
            })

        $("#teamsSection")
            .after(
                $("<p/>")
                    .attr("id", "gamesSection")
                    .text("Game: ")
                    .append(
                        $("<select/>")
                            .attr("id", "games")
                            .append($dateSortedGames)
                    )
            )

        var $mostRecentGame = $("#games option:not([disabled])").last()
        $("#games").val($mostRecentGame.val())

        $("#games").select2()
        $("#gamesSection .select2").after($("<button/>").attr("id", "gamebutton").text("Go"))

        $("#gamebutton").click(function() {
            var gameId = $('#games :selected').data("game-id"),
                $gameButton = $("#gamebutton")
                    .attr("disabled", "disabled")
                    .after($loadingSpan);

            fetch(`http://api.football-api.com/2.0/commentaries/${gameId}?Authorization=${API_KEY}`)
                .then(response => response.json())
                .then(response => {
                    $gameButton.removeAttr("disabled")
                    $loadingSpan.remove()
                    buildTable(response)
                })
                .catch(showError)
        })
    }

    function buildTable(gameCommentaryJson) {
        $("#gamesSection").nextAll().remove()
        $(".error").remove()

        var teamIdForResults = soccer.teamIdForResults,
            gameId = gameCommentaryJson.match_id,
            gameStatsJson = soccer.matchesReponse.find(game => game.id == gameId),
            isHomeTeam = gameStatsJson.localteam_id == teamIdForResults,
            gameResult = gameStatsJson.localteam_score == gameStatsJson.visitorteam_score ? "D" : undefined,
            goalsScored = gameStatsJson[isHomeTeam ? "localteam_score" : "visitorteam_score"],
            goalsAllowed = gameStatsJson[isHomeTeam ? "visitorteam_score" : "localteam_score"],
            gameCommentaryStatsJson = gameCommentaryJson.match_stats[isHomeTeam ? "localteam" : "visitorteam"][0],
            shotsOnGoal = gameCommentaryStatsJson.shots_ongoal,
            firstGoalEvent = gameStatsJson.events.find(event => event.type == "goal"),
            hadFirstGoal = !! firstGoalEvent && firstGoalEvent.team == (isHomeTeam ? "localteam" : "visitorteam"),
            saves = gameCommentaryStatsJson.saves,
            numOfUnsuccessfulPks = gameStatsJson.events.filter(event => event.type == "pen miss" && event.team == (isHomeTeam ? "visitorteam" : "localteam")).length,
            yellowCards = gameCommentaryStatsJson.yellowcards,
            redCards = gameCommentaryStatsJson.redcards;

        if (! gameResult) {
            if (isHomeTeam) {
                gameResult = gameStatsJson.localteam_score > gameStatsJson.visitorteam_score ? "W" : "L"
            } else {
                gameResult = gameStatsJson.localteam_score < gameStatsJson.visitorteam_score ? "W" : "L"
            }
        }

        // Goal: 2 points
        // Win: 5 points
        // Draw: 2 points
        // Loss: 0 points
        // Shot on goal: 0.25 points
        // Save: 1 point
        // PK save: 2 points
        // Yellow card: -1 point
        // Straight red card (or double yellow): -2 points
        // Score first: 1 point
        // Clean sheet: 4 points
        // Allow 1 goal: 2 points
        // Allow 2 goals: 0 points
        // Allow 3 goals: -2 points
        // Allow 4+ goals: -4 points

        var gameResultPoints = gameResult == "W" ? 5 : (gameResult == "D" ? 2 : 0),
            goalsScoredPoints = goalsScored * 2,
            goalsAllowedPoints = goalsAllowed == 0 ? 4 :
                (goalsAllowed == 1 ? 2 :
                    (goalsAllowed == 2 ? 0 :
                        (goalsAllowed == 3 ? -2 : -4))),
            shotsOnGoalPoints = shotsOnGoal * 0.25,
            hadFirstGoalPoints = hadFirstGoal ? 1 : 0,
            savesPoints = saves * 1,
            yellowCardsPoints = yellowCards * -1,
            redCardsPoints = redCards * -2,
            totalPoints =
                gameResultPoints +
                goalsScoredPoints +
                goalsAllowedPoints +
                shotsOnGoalPoints +
                hadFirstGoalPoints +
                savesPoints +
                yellowCardsPoints +
                redCardsPoints

        var $table = $("<table/>")
            .attr("id", "results")
            .append($("<tr/>")
                .append($("<th/>").text("Category"))
                .append($("<th/>").text("Game Stats"))
                .append($("<th/>").text("Points Awarded"))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Result"))
                .append($("<td/>").text(gameResult))
                .append($("<td/>").text(gameResultPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Goals Scored"))
                .append($("<td/>").text(goalsScored))
                .append($("<td/>").text(goalsScoredPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Goals Allowed"))
                .append($("<td/>").text(goalsAllowed))
                .append($("<td/>").text(goalsAllowedPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Shots on Goal"))
                .append($("<td/>").text(shotsOnGoal))
                .append($("<td/>").text(shotsOnGoalPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("First Goal?"))
                .append($("<td/>").text(hadFirstGoal ? "yes" : "no"))
                .append($("<td/>").text(hadFirstGoalPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Saves"))
                .append($("<td/>").text(saves))
                .append($("<td/>").text(savesPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("PK Saves"))
                .append($("<td/>").attr("id", "pkSaves").text(numOfUnsuccessfulPks ? "" : 0))
                .append($("<td/>").attr("id", "pkSavesPoints").text(numOfUnsuccessfulPks ? "???" : 0))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Yellow Cards"))
                .append($("<td/>").text(yellowCards))
                .append($("<td/>").text(yellowCardsPoints))
            )
            .append($("<tr/>")
                .append($("<td/>").text("Red Cards"))
                .append($("<td/>").text(redCards))
                .append($("<td/>").text(redCardsPoints))
            )

        $("p").last().after($table)

        if (numOfUnsuccessfulPks) {
            var pkSavesCommentary = gameCommentaryJson.comments.filter(comment => {
                    var lowerCaseComment = comment.comment.toLowerCase()
                    return (lowerCaseComment.indexOf("pk") !== -1) || (lowerCaseComment.indexOf("penalty") !== -1)
                })
                .reverse()
                .map(comment => {
                    return {
                        minute: comment.minute,
                        comment: comment.comment
                    }
                }),
                pkSavesCommentaryHtml = pkSavesCommentary.reduce((prev, curr) => `${prev}<strong>${curr.minute}:</strong> ${curr.comment}<br><br>`, "")

            $("#pkSaves")
                .prepend(
                    $("<input/>").attr({
                        id: "pkSavesInput",
                        type: "text",
                        maxlength: 2
                    })
                )

            $("#results").after(
                $("<p/>")
                    .attr("id", "pkSavesExplanation")
                    .html(`It looks like there ${numOfUnsuccessfulPks > 1 ? 'were' : 'was'} <strong>${numOfUnsuccessfulPks}</strong> unsuccessful ${numOfUnsuccessfulPks > 1 ? 'PK attempts' : 'PK attempt'} in this game, but this tool can't tell if ${numOfUnsuccessfulPks > 1 ? 'they were' : 'it was'} saved by the keeper or ${numOfUnsuccessfulPks > 1 ? 'were' : 'was'} simply ${numOfUnsuccessfulPks > 1 ? 'misses' : 'a miss'}. Take a look below at the commentary from the game that contains \"PK\" or \"penalty\" to figure out how many PKs the ${window.soccer.teamNameForResults} keeper saved, and enter that number in the PK Saves box above.`)
            )

            $("#pkSavesExplanation").after(
                $("<p/>")
                    .attr("id", "pkSavesCommentary")
                    .html(pkSavesCommentaryHtml)
            )

            $("#pkSavesInput").on("input", function() {
                var inputtedPkSavesValue = $(this).val(),
                    pkSavesPoints = inputtedPkSavesValue * 2

                $("#pkSavesPoints").text(pkSavesPoints)
                $("#results").nextAll().remove()
                showTotal(totalPoints + pkSavesPoints)
            })
        } else {
            showTotal(totalPoints)
        }
    }

    function printPrettyDate(dottedDateString) {
        return dottedDateStringToDate(dottedDateString).toDateString()
    }

    function dottedDateStringToDate(dottedDateString) {
        var m = dottedDateString.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
        return new Date(m[3], m[2] - 1, m[1])
    }

    function showTotal(totalPoints) {
        $("#results").after(
            $("<p/>")
                .attr("id", "total")
                .addClass("code")
                .text(`Total points: ${totalPoints}`)
        )
    }

    function showError(e) {
        $("body")
            .prepend(
                $("<p/>")
                    .addClass("error")
                    .text("Uh oh... looks like something went wrong. Details: ")
                    .append(
                        $("<span/>")
                            .addClass("code")
                            .text(e)
                    )
            )
    }
})()
